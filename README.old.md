# ts-minecraft

Provide several useful function for Minecraft in typescript
## Usage

`import { NBT, ServerInfo, ...so on...} from 'ts-minecraft'`

## Getting Started

- **[NBT](#nbt)**
- **[World](#worldinfo)**
- **[Server](#server)**
- **[Minecraft Install](#minecraft-install)**
- **[GameSetting](#gamesetting)**
- **[Language](#language)**
- **[ResourcePack](#resourcepack)**
- **[Forge](#forge)**
- **[TextComponent](#textcomponent)**
- **[Auth](#auth)**
- **[Launch](#launch)**

### NBT

    import { NBT } from 'ts-minecraft'
    const fileData: Buffer;
    const compressed: boolean;
    const readed: any = NBT.Serializer.deserialize(fileData, compressed).value;

    const serial: NBT.Serializer.create()
        .register('server', {
            name: NBT.TagType.String,
            host: NBT.TagType.String,
            port: NBT.TagType.Int,
            icon: NBT.TagType.String,
        });
    const serverInfo;
    const serialized: Buffer = serial.serialize(serverInfo, 'server');

Serialize/deserialize NBT.

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

Typed NBT API for structured NBT manipulation.

### WorldInfo

    import { WorldInfo } from 'ts-minecraft'
    const levelDatBuffer: Buffer;
    const info: WorldInfo = WorldInfo.parse(levelDatBuffer);
Read a WorldInfo from buffer.

### Server

    import { ServerStatus, ServerInfo } from 'ts-minecraft'
    const seversDatBuffer: Buffer;
    const infos: ServerInfo[] = ServerInfo.parseNBT(seversDatBuffer);
    const info: ServerInfo = infos[0]
    const promise: Promise<ServerStatus> = ServerInfo.fetchStatus(info);

Read sever info and fetch its status.

### Minecraft Install

    import { VersionMeta, VersionMetaList, Version, MetaContainer, MinecraftLocation } from 'ts-minecraft'
    const minecraft: MinecraftLocation;
    const versionPromise: Promise<Version> = Version.updateVersionMeta()
        .then((metas: MetaContainer) => metas.list.versions[0])
        .then((meta: VersionMeta) => Version.install('client', meta, minecraft))

Fully install vanilla minecraft client including assets and libs.

### GameSetting

    import { GameSetting } from 'ts-minecraft'
    const settingString;
    const setting: GameSetting = GameSetting.parse(settingString);
    const string: string = GameSetting.stringify(setting);

Serialize/Deserialize the minecraft game setting string.

### Language

    import { Language, MinecraftLocation } from 'ts-minecraft'
    const location: MinecraftLocation;
    const version: string;
    const langs: Promise<Language[]> = Language.read(location, version)

Read language info from version

### ResourcePack

    import { ResourcePack } from 'ts-minecraft'
    const fileFullPath;
    Promise<ResourcePack> packPromise = ResourcePack.read(fileFullPath);

Read ResourcePack from filePath

### Forge

    import { Forge } from 'ts-minecraft'
    const forgeModJarBuff: Buffer;
    Promise<Forge.MetaData[]> metasPromise = Forge.meta(forgeModJarBuff);

Read the forge mod metadata

    const modConfigString: string;
    const config: Forge.Config = Forge.Config.parse(modConfigString);
    const serializedBack = Forge.Config.stringify(config);

Read the forge mod config

### TextComponent

    import { TextComponent } from 'ts-minecraft'
    const fromString: TextComponent = TextComponent.str('from string');
    const formattedString: string;
    const fromFormatted: TextComponent = TextComponent.from(formattedString);

Create TextComponent from string OR Minecraft's formatted string, like '§cThis is red'

### Auth

    import { Auth, AuthService } from 'ts-minecraft'
    const username: string;
    const password: string;
    const authFromMojang: Promise<Auth> = AuthService.yggdrasilAuth({username, password});
    const authOffline = AuthService.offlineAuth(username);

Using AuthService to online/offline auth

### Launch

    import { Launcher, Auth, AuthService } from 'ts-minecraft'
    const version: string;
    const javaPath: string;
    const gamePath: string;
    const auth: Auth = AuthService.offlineAuth('username');
    const proc: Promise<ChildProcess> = Launcher.launch(auth, {gamePath, javaPath, minMemory, version});

Launch minecraft from a version

## Future Works

- TextComponent to style string

## Issue

- Really need runtime check for parsed Forge/LiteMod data(Hopefully, more people write this correctly)

## Credit

[Yu Xuanchi](https://github.com/yuxuanchiadm), co-worker, quality control of this project.

[Haowei Wen](https://github.com/yushijinhun), the author of [JMCCC](https://github.com/to2mbn/JMCCC), [Authlib Injector](https://github.com/to2mbn/authlib-injector), and [Indexyz](https://github.com/Indexyz), help me a lot on Minecraft launching, authing.

