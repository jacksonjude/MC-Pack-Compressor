# MC-Pack-Compressor

Compresses Minecraft resourcepacks by comparing the resourcepack assets folder to the default Minecraft assets folder. It then removes any excess files that would not be used as altered assets.

## Executable Setup

This option uses an executable and a config file for an easy setup.

- Download the latest release zip
- Place the rpc executable and rpc.properties into the resourcepack
- Open the rpc.properties file and configure it, choosing what files to include, not include, MC version number, etc.
- Run the rpc executable to run the program with the configuration

### Notes

- MC version number will default to the latest release
- Paths to skip can include files, folders, or a path to delete recursively from every folder (such as .DS_Store) by using the argument:

        "*/<file/folder name>"

## Manual Setup

This option uses the source code directly and is more involved.

- Clone the repo
- Run:
        
        cd MC-Pack-Compressor
        npm install

- Get the path of the resourcepack, Minecraft version number, and any files/folders to not include, and any files/folders to explicitly include that would otherwise not be included

## Usage

    cd MC-Pack-Compressor
    npm start <resourcepack path> "mcver=[MC ver #]" "removefiles=[paths to remove...]" "keepfiles=[paths to keep...]"
        
### Example

    npm start ~/Application\ Support/minecraft/resourcepacks/Test "mcver=1.16.1" "removefiles=.DS_Store "*/.DS_Store" assets/minecraft/lang"
