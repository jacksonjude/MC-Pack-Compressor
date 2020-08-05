const tiny = require('tiny-json-http')
const https = require('https')
const fs = require('fs')
const fse = require('fs-extra')
const { zip, zipContents, unzip } = require('@papb/zip')
const path = require('path')

const VERSION_MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest.json"
const ASSETS_FOLDER_NAME = "assets"
const RESOURCE_PACK_SOURCE_FOLDER_NAME = "rp-source"

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
    if (fs.existsSync(pwd + "/" + jarFilename))
    {
      resolve()
    }
    var clientJar = fs.createWriteStream(filename)
    var jarRequest = https.get(clientJarURL, (data) => {
      data.pipe(clientJar).on('finish', () => {
        resolve()
      })
    })
  })

  return downloadJarPromise
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
      console.log("  Downloading: " + clientJarURL)
      await downloadJarFile(clientJarURL, currentDirectory, jarFilename)

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

function compareFolders(resourcepackPath, assetsPath, folderLayerDepth, initialPath)
{
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
        compareFolders(fullPath, assetsPath + "/" + basePath, (folderLayerDepth || 0)+1, initialPath)
      }
      else
      {
        console.log("  ".repeat(folderLayerDepth) + "Removing " + fullPath.replace(initialPath, ""))
        fs.rmdirSync(fullPath, { recursive: true })
      }
    }
    else if (!fs.existsSync(assetsPath + "/" + basePath))
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
    await zip(resourcepackPath, path.basename(newFilepath))
    resolve()
  })

  return zipResourcePackPromise
}

async function app()
{
  var assetFolderName = await downloadDefaultAssets(process.argv[3], VERSION_MANIFEST_URL, __dirname, ASSETS_FOLDER_NAME)
  var assetFolderPath = __dirname + "/" + assetFolderName

  var resourcepackFolderName = path.basename(process.argv[2] || RESOURCE_PACK_SOURCE_FOLDER_NAME)
  var resourcepackFolderPath = __dirname + "/" + resourcepackFolderName

  console.log("Copying resourcepack: " + resourcepackFolderName)
  await copyResourcepackFolder(process.argv[2], resourcepackFolderPath)

  if (process.argv.length >= 5)
  {
    var filesToIgnore = process.argv.concat()
    filesToIgnore.splice(0, 4)
    console.log("Removing files: " + filesToIgnore)
    removeIgnoredFiles(resourcepackFolderPath, filesToIgnore)
  }

  console.log("Comparing " + resourcepackFolderName + " to " + assetFolderName)
  compareFolders(resourcepackFolderPath + "/" + ASSETS_FOLDER_NAME, assetFolderPath)

  console.log("Zipping " + resourcepackFolderName)
  await zipResourcePack(resourcepackFolderPath, resourcepackFolderPath + ".zip")

  fs.rmdirSync(resourcepackFolderPath, { recursive: true })
}

app()
