# Minecraft Launcher Core

[![npm version](https://img.shields.io/npm/v/ts-minecraft.svg)](https://www.npmjs.com/package/ts-minecraft)
[![npm](https://img.shields.io/npm/l/ts-minecraft.svg)](https://github.com/ci010/ts-minecraft/blob/3.0/LICENSE)
[![Build Status](https://travis-ci.org/ci010/ts-minecraft.svg?branch=5.0)](https://travis-ci.org/ci010/ts-minecraft)
[![Coverage Status](https://coveralls.io/repos/github/ci010/ts-minecraft/badge.svg?branch=5.0)](https://coveralls.io/github/ci010/ts-minecraft?branch=5.0)

Provide several useful functions for Minecraft.

This package is targeting the [Electron](https://electronjs.org) environment. Feel free to report issues related to it.

## Usage

`import { NBT, ServerInfo, ...so on...} from 'ts-minecraft'`

## Getting Started

- [Minecraft Launcher Core](#Minecraft-Launcher-Core)
  - [Usage](#Usage)
  - [Getting Started](#Getting-Started)
    - [NBT](#NBT)
    - [WorldInfo](#WorldInfo)
    - [Server](#Server)
    - [Minecraft Install](#Minecraft-Install)
    - [GameSetting](#GameSetting)
    - [Language](#Language)
    - [ResourcePack](#ResourcePack)
    - [Game Profile](#Game-Profile)
    - [Mojang Account Info](#Mojang-Account-Info)
    - [Forge](#Forge)
    - [Fabric](#Fabric)
    - [TextComponent](#TextComponent)
    - [Auth](#Auth)
    - [Version](#Version)
    - [Launch](#Launch)
  - [Experiental Features](#Experiental-Features)
    - [Monitor download progress](#Monitor-download-progress)
  - [Caching Request](#Caching-Request)
  - [Issue](#Issue)
  - [Credit](#Credit)

### NBT

```ts
    import { NBT } from 'ts-minecraft'
    const fileData: Buffer;
    const compressed: boolean;
    const readed: NBT.TypedObject = NBT.Serializer.deserialize(fileData, compressed);

    const serial: NBT.Serializer.create()
        .register('server', {
            name: NBT.TagType.String,
            host: NBT.TagType.String,
            port: NBT.TagType.Int,
            icon: NBT.TagType.String,
        });
    const serverInfo;
    const serialized: Buffer = serial.serialize(serverInfo, 'server');
```

Serialize/deserialize NBT.

```ts
    import { NBT } from 'ts-minecraft'
    // First create NBT tag like this.
    let rootTag: NBT.TagCompound = NBT.TagCompound.newCompound();
    rootTag.set('TheEnd', NBT.TagScalar.newString("That's all"));
    rootTag.set('key1', NBT.TagScalar.newString('value1'));
    // Checks if key exists. Then cast it to string tag.
    let key1Tag: NBT.TagString = checkExists(rootTag.get('key1')).asTagString();
    function checkExists<T>(t: T | undefined): T {
        if (t === undefined)
            throw new Error('key not exists');
        return t;
    }
    console.log(key1Tag.value); // print value1
    // If list contains list. list those inside forget there element type.
    let listTag: NBT.TagList<NBT.TagAnyList> = NBT.TagList.newListList();
    rootTag.set('testList', listTag);
    let stringListTag: NBT.TagList<NBT.TagString> = NBT.TagList.newStringList();
    stringListTag.push(NBT.TagScalar.newString('hello'), NBT.TagScalar.newString('world'));
    let doubleListTag: NBT.TagList<NBT.TagDouble> = NBT.TagList.newDoubleList();
    // This gives you a way to add different list in.
    listTag.push(stringListTag, doubleListTag);
    // And still prevent you add other things in it.
    // listTag.push(NBT.TagCompound.newCompound()); // Illegal
    // You can cast list to whatever list you want after you got a list without element type.
    console.log(listTag[0].asTagListString()[0].asTagString().value); // print hello
    // You can iterate values in list.
    for (let stringTag of stringListTag) {
        console.log(stringTag.value); // print hello then print world
    }
    // And also entries in compound.
    for (let [key, value] of rootTag) {
        if (value.tagType === NBT.TagType.String)
            console.log('[' + key + ' = ' + value.asTagString().value + ']');
    }
    // Finally you can write root tags to buffer and read root tags from buffer.
    let buffer: Buffer = NBT.Persistence.writeRoot(rootTag, { compressed: true } );
    let ourTag: NBT.TagCompound = NBT.Persistence.readRoot(buffer, { compressed: true } );
    console.log(checkExists(ourTag.get('TheEnd')).asTagString().value); // print That's all
```

Typed NBT API for structured NBT manipulation.

### WorldInfo

```ts
    import { WorldInfo } from 'ts-minecraft'
    const levelDatBuffer: Buffer;
    const info: WorldInfo = WorldInfo.parse(levelDatBuffer);
```

Read a WorldInfo from buffer.

### Server

```ts
    import { Server } from 'ts-minecraft'
    const seversDatBuffer: Buffer;
    const infos: Server.Info[] = Server.parseNBT(seversDatBuffer);
    const info: Server.Info = infos[0]
    // fetch the server status
    const promise: Promise<Server.Status> = Server.fetchStatus(info);
    // or you want the raw json
    const rawJsonPromise: Promise<Server.StatusFrame> = Server.fetchStatusFrame(info);
```

Read sever info and fetch its status.

### Minecraft Install

```ts
    import { VersionMeta, VersionMetaList, Version, MetaContainer, MinecraftLocation } from 'ts-minecraft'
    const minecraft: MinecraftLocation;
    const versionPromise: Promise<Version> = Version.updateVersionMeta()
        .then((metas: MetaContainer) => metas.list.versions[0]) // i just pick the first version in list here 
        .then((meta: VersionMeta) => Version.install('client', meta, minecraft))
```

Fully install vanilla minecraft client including assets and libs.

### GameSetting

```ts
    import { GameSetting } from 'ts-minecraft'
    const settingString;
    const setting: GameSetting = GameSetting.parse(settingString);
    const string: string = GameSetting.stringify(setting);
```

Serialize/Deserialize the minecraft game setting string.

### Language

```ts
    import { Language, MinecraftLocation } from 'ts-minecraft'
    const location: MinecraftLocation;
    const version: string;
    const langs: Promise<Language[]> = Language.read(location, version)
```

Read language info from version

### ResourcePack

```ts
    import { ResourcePack } from 'ts-minecraft'
    const fileFullPath;
    Promise<ResourcePack> packPromise = ResourcePack.read(fileFullPath);
    // or you want read from folder, same function call
    Promise<ResourcePack> fromFolder = ResourcePack.read(fileFullPath);

    // if you have already read the file, don't want to reopen the file
    // the file path will be only used for resource pack name
    const fileContentBuffer: Buffer;
    Promise<ResourcePack> packPromise = ResourcePack.read(fileFullPath, fileContentBuffer);
```

Read ResourcePack from filePath

### Game Profile 

```ts
    import { ProfileService, GameProfile } from 'ts-minecraft'
    const userUUID: string;
    const gameProfilePromise: Promise<GameProfile> = ProfileService.fetch(userUUID);
```

Or lookup profile by name.

```ts
    const username: string;
    const gameProfilePromise: Promise<GameProfile> = ProfileService.lookup(username);
```

Fetch the user game profile by uuid. This could also be used for get skin.

```ts
    const gameProfile: GameProfile;
    const texturesPromise: Promise<GameProfile.Textures> = ProfileService.fetchProfileTexture(gameProfile);
```

### Mojang Account Info

```ts
    import { MojangService } from 'ts-minecraft'
    const accessToken: string;
    const info: Promise<MojangAccount> = MojangService.getAccountInfo(accessToken); 
```

### Forge

```ts
    import { Forge } from 'ts-minecraft'
    const forgeModJarBuff: Buffer;
    Promise<Forge.MetaData[]> metasPromise = Forge.meta(forgeModJarBuff);
```

Read the forge mod metadata, including @Mod annotation and mcmod json data

```ts
    const modConfigString: string;
    const config: Forge.Config = Forge.Config.parse(modConfigString);
    const serializedBack = Forge.Config.stringify(config);
```

Read the forge mod config

```ts
    import { ForgeWebPage } from 'ts-minecraft'
    const pagePromise = ForgeWebPage.getWebPage(); 
    const minecraftLocation: MinecraftLocation;
    pagePromise.then((page) => {
        const mcversion = page.mcversion;
        const firstVersionOnPage = page.versions[0];
        const forgeVersionMeta = Forge.VersionMeta.from(firstVersionOnPage);
        return Forge.install(forgeVersionMeta, minecraftLocation);
    });
```

Get the forge version info and install forge from it. 

Notice that this installation doesn't ensure full libraries installation.
Please run `Version.checkDependencies` afther that.

The new 1.13 forge installation process requires java to run. 
Either you have `java` executable in your environment variable PATH,
or you can assign java location by `Forge.install(forgeVersionMeta, minecraftLocation, { java: yourJavaExecutablePath });`.

If you use this auto installation process to install forge, please checkout [Lex's Patreon](https://www.patreon.com/LexManos).
Consider support him to maintains forge.

### Fabric 

```ts
    import { Fabric } from 'ts-minecraft'
    const versionList: Fabric.VersionList = await Fabric.updateVersionList();
    const latestYarnVersion = versionList.yarnVersions[0]; // yarn version is combined by mcversion+yarn build number
    const latestLoaderVersion = versionList.loaderVersions[0];
```

Fetch the new fabric version list.

```ts
    import { Fabric } from 'ts-minecraft'
    const minecraftLocation: MinecraftLocation;
    const yarnVersion: string; // e.g. "1.14.1+build.10"
    const loaderVersion: string; // e.g. "0.4.7+build.147"
    const installPromise: Promise<void> = Fabric.install(yarnVersion, loaderVersion, minecraftLocation)
```

Install fabric to the client. This installation process doesn't ensure the minecraft libraries.

Please run `Version.checkDependencies` after that to install fully.

### TextComponent

```ts
    import { TextComponent } from 'ts-minecraft'
    const fromString: TextComponent = TextComponent.str('from string');
    const formattedString: string;
    const fromFormatted: TextComponent = TextComponent.from(formattedString);
```

Create TextComponent from string OR Minecraft's formatted string, like '§cThis is red'

### Auth

```ts
    import { Auth } from 'ts-minecraft'
    const username: string;
    const password: string;
    const authFromMojang: Promise<Auth> = Auth.Yggdrasil.login({username, password});
    const authOffline = Auth.offline(username);
```

Using AuthService to online/offline auth

### Version

```ts
    import { Version } from 'ts-minecraft'
    const location: MinecraftLocation;
    const versionId: string;
    const version: Version = Version.parse(location, versionId);
```

Parse existed version.

### Launch

```ts
    import { Launcher } from 'ts-minecraft'
    const version: string;
    const javaPath: string;
    const gamePath: string;
    const proc: Promise<ChildProcess> = Launcher.launch({gamePath, javaPath, version});
```

Launch minecraft from a version

## Experiental Features

They might be not stable.

### Monitor download progress

```ts
    import { Version } from 'ts-minecraft';

    const expectedVersion: string;
    const expectedMcLoc: MinecraftLocation;
    const resolvedVersion: Version = await Version.parse(expectedMcLoc, expectedVersion);
    const task: Task<Version> = Version.checkDependenciesTask(resolvedVersion, expectedMcLoc);
```

## Caching Request

The functions that request minecraft version manifest, forge version webpage, or liteload version manifest can have cache option.

You should save the old result from those functions and pass it as the fallback option. These function will check if your old manifest is outdated or not, and it will only request a new one when your fallback option is outdated.

For Minecraft:

```ts
    const forceGetTheVersionMeta = Version.updateVersionMeta();
    const result = Version.updateVersionMeta({ fallback: forceGetTheVersionMeta }); // this should not request the manifest url again, since the forceGetTheVersionMeta is not outdated.
```

Normally you will load the last version manifest from file:

```ts
    const oldManifest = JSON.parse(fs.readFileSync("manifest-whatevername-cache.json").toString());
    const result = Version.updateVersionMeta({ fallback: oldManifest }); // the result should up-to-date.
```

For Forge, it's the same:

```ts
    const forgeGet = ForgeWebPage.getWebPage(); // force get

    const oldWebPageCache = JSON.parse(fs.readFileSync("forge-anyname-cache.json").toString());
    const updated = ForgeWebPage.getWebPage({ fallback: oldWebPageCache }); // this should be up-to-date
```

## Issue

- Really need runtime check for parsed Forge/LiteMod data(Hopefully, more people write this correctly)

## Credit

[Yu Xuanchi](https://github.com/yuxuanchiadm), co-worker, quality control of this project.

[Haowei Wen](https://github.com/yushijinhun), the author of [JMCCC](https://github.com/to2mbn/JMCCC), [Authlib Injector](https://github.com/to2mbn/authlib-injector), and [Indexyz](https://github.com/Indexyz), help me a lot on Minecraft launching, authing.

