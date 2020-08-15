const tiny = require('tiny-json-http')
const https = require('https')
const fs = require('fs')
const fse = require('fs-extra')
const { zipDirContents, unzip } = require('@papb/zip')
const path = require('path')
const crypto = require('crypto')

const VERSION_MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest.json"
const ASSETS_FOLDER_NAME = "assets"

const MC_VER_ARG_KEY = "mcver"
const REMOVE_FILES_ARG_KEY = "removefiles"
const KEEP_FILES_ARG_KEY = "keepfiles"

function getArgArray(rawArgs)
{
  var arguments = {}
  arguments[MC_VER_ARG_KEY] = null
  arguments[REMOVE_FILES_ARG_KEY] = []
  arguments[KEEP_FILES_ARG_KEY] = []

  for (argNum in rawArgs)
  {
    if (argNum <= 2) { continue }
    if (!rawArgs[argNum].includes("=")) { continue }

    var argumentKeyValue = rawArgs[argNum].split("=")
    if (argumentKeyValue[1] == "") { continue }

    switch (argumentKeyValue[0])
    {
      case MC_VER_ARG_KEY:
      arguments[MC_VER_ARG_KEY] = argumentKeyValue[1]
      break

      case REMOVE_FILES_ARG_KEY:
      arguments[REMOVE_FILES_ARG_KEY] = argumentKeyValue[1].split(" ")
      break

      case KEEP_FILES_ARG_KEY:
      arguments[KEEP_FILES_ARG_KEY] = argumentKeyValue[1].split(" ")
      break
    }
  }

  return arguments
}

function fetchVersionManifest(manifestURL)
{
  var versionManifestPromise = new Promise((resolve, reject) => {
    tiny.get({url: manifestURL}, (err, data) => {
      resolve(data.body)
    })
  })

  return versionManifestPromise
}

function getVersionJSONURL(versionNumber, versionArray)
{
  for (versionOn in versionArray)
  {
    if (versionArray[versionOn].id == versionNumber)
    {
      return versionArray[versionOn].url
    }
  }

  return null
}

function fetchVersionJSON(versionJSONURL)
{
  var versionJSONPromise = new Promise((resolve, reject) => {
    tiny.get({url: versionJSONURL}, (err, data) => {
      resolve(data.body)
    })
  })

  return versionJSONPromise
}

function downloadJarFile(clientJarURL, pwd, filename)
{
  var downloadJarPromise = new Promise((resolve, reject) => {
    var clientJar = fs.createWriteStream(filename)
    var jarRequest = https.get(clientJarURL, (data) => {
      data.pipe(clientJar).on('finish', () => {
        resolve()
      })
    })
  })

  return downloadJarPromise
}

function getJarHash(filename, pwd)
{
  var getHashPromise = new Promise((resolve, reject) => {
    var fd = fs.createReadStream(pwd + "/" + filename);
    var hash = crypto.createHash('sha1');
    hash.setEncoding('hex');

    fd.on('end', () => {
      hash.end()
      resolve(hash.read())
    })

    fd.pipe(hash)
  })

  return getHashPromise
}

function shouldDownloadJar(filename, version, pwd, hash)
{
  var shouldDownloadPromise = new Promise(async (resolve, reject) => {
    if (fs.existsSync(pwd + "/" + filename))
    {
      if (fs.existsSync(pwd + "/" + version))
      {
        fs.rmdirSync(pwd + "/" + version, { recursive: true })
      }

      var jarHash = await getJarHash(filename, pwd)
      if (jarHash == hash)
      {
        resolve(false)
      }
      else
      {
        fs.unlinkSync(pwd + "/" + filename)
        resolve(true)
      }
    }

    resolve(true)
  })

  return shouldDownloadPromise
}

function unzipJarFile(filename, pwd, foldername)
{
  var unzipJarPromise = new Promise(async (resolve, reject) => {
    if (fs.existsSync(pwd + "/" + foldername))
    {
      resolve()
    }
    await unzip(filename, pwd + "/" + foldername)
    resolve()
  })

  return unzipJarPromise
}

function moveAssetsFolder(pwd, jarFoldername, assetsFolderName, newAssetsFolderName)
{
  fs.renameSync(pwd + "/" + jarFoldername + "/" + assetsFolderName, pwd + "/" + newAssetsFolderName)
}

function removeClientFiles(jarFilename, jarFoldername)
{
  if (fs.existsSync(jarFilename))
  {
    fs.unlinkSync(jarFilename)
  }
  if (fs.existsSync(jarFoldername))
  {
    fs.rmdirSync(jarFoldername, { recursive: true })
  }
}

async function downloadDefaultAssets(versionToDownload, manifestURL, currentDirectory, assetsFolderName)
{
  console.log("Fetching Minecraft assets...")
  var downloadAssetsPromise = new Promise(async (resolve, reject) => {
    var versionManifest = await fetchVersionManifest(manifestURL)
    var defaultVersionToDownload = versionManifest.latest.release

    var versionJSONURL = await getVersionJSONURL(versionToDownload, versionManifest.versions)
    if (!versionJSONURL)
    {
      if (versionToDownload)
      {
        console.log("WARN: Version " + versionToDownload + " not found. Defaulting to latest version (" + defaultVersionToDownload + ")")
      }

      versionJSONURL = await getVersionJSONURL(defaultVersionToDownload, versionManifest.versions)

      if (!versionJSONURL)
      {
        console.log("ERR: Latest release version (" + defaultVersionToDownload + ") JSON URL not found")
        reject()
      }

      versionToDownload = defaultVersionToDownload
    }

    var jarFilename = versionToDownload + ".jar"
    var newAssetsFolderName = assetsFolderName + "-" + versionToDownload

    var versionJSON = await fetchVersionJSON(versionJSONURL)
    if (!versionJSON)
    {
      console.log("ERR: Version JSON for " + versionToDownload + " not found at " + versionJSONURL)
      reject()
    }

    if (!fs.existsSync(currentDirectory + "/" + newAssetsFolderName))
    {
      var clientJarURL = versionJSON.downloads.client.url

      var downloadJar = await shouldDownloadJar(jarFilename, versionToDownload, currentDirectory, versionJSON.downloads.client.sha1)
      if (downloadJar)
      {
        console.log("  Downloading: " + clientJarURL)
        await downloadJarFile(clientJarURL, currentDirectory, jarFilename)
      }

      console.log("  Unzipping: " + jarFilename)
      await unzipJarFile(jarFilename, currentDirectory, versionToDownload)

      console.log("  Copying assets...")
      moveAssetsFolder(currentDirectory, versionToDownload, assetsFolderName, newAssetsFolderName)
    }

    removeClientFiles(jarFilename, versionToDownload)

    resolve(newAssetsFolderName)
  })

  return downloadAssetsPromise
}

function copyResourcepackFolder(folderPath, pwd)
{
  var copyResourcepackFolderPromise = new Promise((resolve, reject) => {
    fse.copy(folderPath, pwd, (err) => {
      if (err)
      {
        console.log("ERR: Copy resourcepack error - " + err)
        reject()
      }
      resolve()
    })
  })

  return copyResourcepackFolderPromise
}

function removeIgnoredFiles(folderPath, pathsToDelete)
{
  for (pathNum in pathsToDelete)
  {
    if (pathsToDelete[pathNum].startsWith("*/"))
    {
      searchThroughFolder(folderPath, pathsToDelete[pathNum].replace("*/", ""))
    }
    else
    {
      let pathToDelete = folderPath + "/" + pathsToDelete[pathNum]

      if (!fs.existsSync(pathToDelete)) { continue }

      if (fs.lstatSync(pathToDelete).isDirectory())
      {
        fs.rmdirSync(pathToDelete, { recursive: true })
      }
      else
      {
        fs.unlinkSync(pathToDelete)
      }
    }
  }
}

function searchThroughFolder(folderPath, pathToDelete)
{
  var pathsToSearch = fs.readdirSync(folderPath)
  for (pathNum in pathsToSearch)
  {
    let basePath = pathsToSearch[pathNum]
    let fullPath = folderPath + "/" + basePath

    if (basePath == pathToDelete)
    {
      if (fs.lstatSync(fullPath).isDirectory())
      {
        fs.rmdirSync(fullPath, { recursive: true })
      }
      else
      {
        fs.unlinkSync(fullPath)
      }
    }
    else if (fs.lstatSync(fullPath).isDirectory())
    {
      searchThroughFolder(fullPath, pathToDelete)
    }
  }
}

function compareFolders(resourcepackPath, assetsPath, keepFiles, folderLayerDepth, initialPath)
{
  if (!fs.existsSync(resourcepackPath))
  {
    console.log("WARN: Path - " + resourcepackPath + " does not exist")
    return
  }

  var initialPath = initialPath
  if ((folderLayerDepth || 0) == 0)
  {
    initialPath = resourcepackPath
  }
  if ((folderLayerDepth || 0) > 0)
  {
    console.log("  ".repeat(folderLayerDepth-1) + "Scanning " + resourcepackPath.replace(initialPath, ""))
  }
  var pathsToCompare = fs.readdirSync(resourcepackPath)
  for (pathNum in pathsToCompare)
  {
    let basePath = pathsToCompare[pathNum]
    let fullPath = resourcepackPath + "/" + basePath

    if (fs.lstatSync(fullPath).isDirectory())
    {
      if (fs.existsSync(assetsPath + "/" + basePath))
      {
        compareFolders(fullPath, assetsPath + "/" + basePath, keepFiles, parseInt(folderLayerDepth || 0)+1, initialPath)
      }
      else if (!keepFiles.includes(assetsPath + "/" + basePath) && !keepFiles.includes("*/" + basePath))
      {
        console.log("  ".repeat(folderLayerDepth) + "Removing " + fullPath.replace(initialPath, ""))
        fs.rmdirSync(fullPath, { recursive: true })
      }
    }
    else if (!fs.existsSync(assetsPath + "/" + basePath) && !keepFiles.includes(assetsPath + "/" + basePath) && !keepFiles.includes("*/" + basePath))
    {
      console.log("  ".repeat(folderLayerDepth) + "Removing " + fullPath.replace(initialPath, ""))
      fs.unlinkSync(fullPath)
    }
  }
}

function zipResourcePack(resourcepackPath, newFilepath)
{
  var zipResourcePackPromise = new Promise(async (resolve, reject) => {
    if (fs.existsSync(newFilepath))
    {
      fs.unlinkSync(newFilepath)
    }
    await zipDirContents(resourcepackPath, path.basename(newFilepath))
    resolve()
  })

  return zipResourcePackPromise
}

async function app()
{
  if (process.argv.length < 2)
  {
    console.log("ERR: Resourcepack path not provided (usage: npm start <resourcepack path> args...)")
    return
  }

  var inputArguments = getArgArray(process.argv)
  console.log(inputArguments)

  var assetFolderName = await downloadDefaultAssets(inputArguments[MC_VER_ARG_KEY], VERSION_MANIFEST_URL, __dirname, ASSETS_FOLDER_NAME)
  var assetFolderPath = __dirname + "/" + assetFolderName

  var resourcepackFolderName = path.basename(process.argv[2])
  var resourcepackFolderPath = __dirname + "/" + resourcepackFolderName

  console.log("Copying resourcepack: " + resourcepackFolderName)
  await copyResourcepackFolder(process.argv[2], resourcepackFolderPath)

  if (inputArguments[REMOVE_FILES_ARG_KEY].length > 0)
  {
    console.log("Removing files: " + inputArguments[REMOVE_FILES_ARG_KEY])
    removeIgnoredFiles(resourcepackFolderPath, inputArguments[REMOVE_FILES_ARG_KEY])
  }

  console.log("Comparing " + resourcepackFolderName + " to " + assetFolderName)
  if (inputArguments[KEEP_FILES_ARG_KEY].length > 0)
  {
    console.log("(Keeping files: " + inputArguments[KEEP_FILES_ARG_KEY] + " during comparison)")
  }
  compareFolders(resourcepackFolderPath + "/" + ASSETS_FOLDER_NAME, assetFolderPath, inputArguments[KEEP_FILES_ARG_KEY])

  console.log("Zipping " + resourcepackFolderName)
  await zipResourcePack(resourcepackFolderPath, resourcepackFolderPath + ".zip")

  fs.rmdirSync(resourcepackFolderPath, { recursive: true })
}

app()
