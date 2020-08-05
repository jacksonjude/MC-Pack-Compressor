# MC-Pack-Compressor

Compresses Minecraft resourcepacks by comparing the resourcepack assets folder to the default Minecraft assets folder

## Setup

- Run:

        npm install

- Get the path of the resourcepack, Minecraft version number, and any files/folders to not include

## Usage

    cd MC-Pack-Compressor
    npm start <resourcepack path> [MC ver #] [paths to skip...]

### Notes

- MC version number will default to the latest release
- Paths to skip can include files, folders, or a path to delete recursively from every folder (such as .DS_Store) by using the argument:

        "*/<file/folder name>"
        
### Example

    npm start ~/Application\ Support/minecraft/resourcepacks/Test 1.16.1 .DS_Store "*/.DS_Store" assets/minecraft/lang
