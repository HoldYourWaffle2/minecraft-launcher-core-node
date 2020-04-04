import * as fs from "fs";
import * as paths from "path";

import { Version } from "@xmcl/common";
import Task from "@xmcl/task";
import { computeChecksum, exists, MinecraftFolder, MinecraftLocation, validate } from "@xmcl/util";

export function parseLibPath(name: string) {
    const pathArr = name.split(":");

    const groupPath = pathArr[0].replace(/\./g, "/");
    const id = pathArr[1];
    const versionIdentifier = pathArr[2];
    let version;
    let ext;
    if (versionIdentifier.indexOf("@") !== -1) {
        [version, ext] = versionIdentifier.split("@");
    } else {
        version = versionIdentifier;
        ext = "jar";
    }
    const isSnapshot = version.endsWith("-SNAPSHOT");

    let base = !isSnapshot ? `${groupPath}/${id}/${version}/${id}-${version}` : `${groupPath}/${id}/${version}/${version}`;
    if (pathArr[3]) {
        base += `-${pathArr[3]}`;
    }

    return `${base}.${ext}`;
}

export interface ResolvedVersion {
    inheritsFrom?: string;
    assetIndex: Version.AssetIndex;
    assets: string;
    downloads: {
        client: Version.Download,
        server: Version.Download,
        [key: string]: Version.Download,
    };
    libraries: ResolvedLibrary[];
    id: string;
    arguments: {
        game: Version.LaunchArgument[],
        jvm: Version.LaunchArgument[],
    };
    mainClass: string;
    minimumLauncherVersion: number;
    releaseTime: string;
    time: string;
    type: string;
    /**
     * The minecraft version of this version
     */
    client: string;
    server: string;
    logging?: {
        [key: string]: {
            file: Version.Download,
            argument: string,
            type: string,
        },
    };

    minecraftDirectory: string;

    pathChain: string[];
}

function getPlatform() {
    const os = require("os");
    let arch = os.arch();
    if (arch.startsWith("x")) { arch = arch.substring(1); }
    const version = os.release();
    switch (os.platform()) {
        case "darwin":
            return { name: "osx", version, arch };
        case "linux":
            return { name: "linux", version, arch };
        case "win32":
            return { name: "windows", version, arch };
        default:
            return { name: "unknown", version, arch };
    }
}

export interface VersionDiagnosis {
    minecraftLocation: MinecraftFolder;
    version: string;

    missingVersionJson: string;
    missingVersionJar: boolean;
    missingAssetsIndex: boolean;

    missingLibraries: ResolvedLibrary[];
    missingAssets: { [file: string]: string };
}

declare module "@xmcl/common/version" {
    namespace Version {
        /**
         * Recursively parse the version JSON.
         *
         * This function requires that the id in version.json is identical to the directory name of that version.
         *
         * e.g. .minecraft/<version-a>/<version-a.json> and in <version-a.json>:
         *
         * { "id": "<version-a>", ... }
         *
         * @param minecraftPath The .minecraft path
         * @param version The vesion id.
         * @return The final resolved version detail
         */
        export function parse(minecraftPath: MinecraftLocation, version: string): Promise<ResolvedVersion>;
        /**
         * Simply extends the version (actaully mixin)
         *
         * The result version will have the union of two version's libs. If one lib in two versions has different version, it will take the extra version one.
         * It will also mixin the launchArgument if it could.
         *
         * This function can be used for mixin forge and liteloader version.
         *
         * This function will throw an Error if two version have different assets. It doesn't care about the detail version though.
         *
         * @beta
         * @param id The new version id
         * @param parent The parent version will be inherited
         * @param extra The extra version info which will overlap some parent information
         * @return The raw version json could be save to the version json file
         */
        export function extendsVersion(id: string, parent: ResolvedVersion, extra: ResolvedVersion): Version;

        /**
         * Diagnose the version. It will check the version json/jar, libraries and assets.
         *
         * @param version The version id string
         * @param minecraft The minecraft location
         */
        export function diagnose(version: string, minecraft: MinecraftLocation): Promise<VersionDiagnosis>;

        /**
         * Diagnose the version. It will check the version json/jar, libraries and assets.
         *
         * @param version The version id string
         * @param minecraft The minecraft location
         */
        export function diagnoseTask(version: string, minecraft: MinecraftLocation): Task<VersionDiagnosis>;

        export function mixinArgumentString(hi: string, lo: string): string;
    }
}

Version.parse = parse;
Version.extendsVersion = extendsVersion;
Version.diagnose = diagnose;
Version.diagnoseTask = diagnoseTask;
Version.mixinArgumentString = mixinArgumentString;

function parse(minecraftPath: MinecraftLocation, version: string): Promise<ResolvedVersion> {
    return resolveDependency(minecraftPath, version).then(parseVersionHierarchy);
}

function extendsVersion(id: string, parent: ResolvedVersion, extra: ResolvedVersion): Version {
    if (parent.assets !== extra.assets) { throw new Error("Cannot extends to the different minecraft version"); }

    const libMap: { [name: string]: ResolvedLibrary } = {};
    parent.libraries.forEach((l) => { libMap[l.name] = l; });

    const extraLibs = extra.libraries.filter((l) => libMap[l.name] === undefined).map((lib) => {
        const alib: any = Object.assign({}, lib);
        delete alib.download;
        if (lib.download.sha1 === "") {
            const url = lib.download.url.substring(0, lib.download.url.length - lib.download.path.length);
            if (url !== "https://libraries.minecraft.net/") { alib.url = url; }
        }
        return alib;
    });
    const launcherVersion = Math.max(parent.minimumLauncherVersion, extra.minimumLauncherVersion);

    const raw: Version = {
        id,
        time: new Date().toISOString(),
        releaseTime: new Date().toISOString(),
        type: extra.type,
        libraries: extraLibs,
        mainClass: extra.mainClass,
        inheritsFrom: parent.id,
        minimumLauncherVersion: launcherVersion,
    };

    if (launcherVersion < 21) {
        raw.minecraftArguments = mixinArgumentString(parent.arguments.game.filter((arg) => typeof arg === "string").join(" "),
            extra.arguments.game.filter((arg) => typeof arg === "string").join(" "));
    } else {
        // not really know how new forge will do
    }

    return raw;
}
/**
 * Mixin the string arguments
 * @beta
 * @param hi Higher priority argument
 * @param lo Lower priority argument
 */
function mixinArgumentString(hi: string, lo: string): string {
    const arrA = hi.split(" ");
    const arrB = lo.split(" ");
    const args: { [key: string]: string[] } = {};
    for (let i = 0; i < arrA.length; i++) { // collection higher priority argument
        const element = arrA[i];
        if (!args[element]) { args[element] = []; }
        if (arrA[i + 1]) { args[element].push(arrA[i += 1]); }
    }
    for (let i = 0; i < arrB.length; i++) { // collect lower priority argument
        const element = arrB[i];
        if (!args[element]) { args[element] = []; }
        if (arrB[i + 1]) { args[element].push(arrB[i += 1]); }
    }
    const out: string[] = [];
    for (const k of Object.keys(args)) {
        switch (k) {
            case "--tweakClass":
                const set: { [arg: string]: 0 } = {};
                for (const v of args[k]) { set[v] = 0; }
                Object.keys(set).forEach((v) => out.push(k, v));
                break;
            default:
                if (args[k][0]) { out.push(k, args[k][0]); } // use higher priority argument in common
                break;
        }
    }
    return out.join(" ");
}

/**
 * Diagnose the version. It will check the version json/jar, libraries and assets.
 *
 * @param version The version id string
 * @param minecraft The minecraft location
 */
function diagnose(version: string, minecraft: MinecraftLocation): Promise<VersionDiagnosis> {
    return diagnoseTask(version, minecraft).execute();
}

/**
 * Diagnose the version. It will check the version json/jar, libraries and assets.
 *
 * @param version The version id string
 * @param minecraft The minecraft location
 */
function diagnoseTask(version: string, minecraft: MinecraftLocation): Task<VersionDiagnosis> {
    return Task.create("Diagnose", diagnoseSkeleton(version, typeof minecraft === "string" ? new MinecraftFolder(minecraft) : minecraft));
}

function diagnoseSkeleton(version: string, minecraft: MinecraftFolder): (context: Task.Context) => Promise<VersionDiagnosis> {
    return async (context: Task.Context) => {
        let resolvedVersion: ResolvedVersion;
        try {
            resolvedVersion = await context.execute("checkVersionJson", () => Version.parse(minecraft, version));
        } catch (e) {
            return {
                minecraftLocation: minecraft,
                version,

                missingVersionJson: e.version,
                missingVersionJar: false,
                missingAssetsIndex: false,

                missingLibraries: [],
                missingAssets: {},
            };
        }
        const jarPath = minecraft.getVersionJar(resolvedVersion.client);
        const missingJar = !await context.execute("checkJar", () => validate(jarPath, resolvedVersion.downloads.client.sha1));
        const assetsIndexPath = minecraft.getAssetsIndex(resolvedVersion.assets);
        const missingAssetsIndex = !await context.execute("checkAssetIndex", async () => validate(assetsIndexPath, resolvedVersion.assetIndex.sha1));
        const libMask = await context.execute("checkLibraries", () => Promise.all(resolvedVersion.libraries.map(async (lib) => {
            const libPath = minecraft.getLibraryByPath(lib.download.path);
            if (await exists(libPath)) {
                if (lib.download.sha1) {
                    return computeChecksum(libPath).then((c) => c === lib.download.sha1);
                }
                return true;
            }
            return false;
        })));
        const missingLibraries = resolvedVersion.libraries.filter((_, i) => !libMask[i]);
        const missingAssets: { [object: string]: string } = {};

        if (!missingAssetsIndex) {
            const objects = (await fs.promises.readFile(assetsIndexPath).then((b) => b.toString()).then(JSON.parse)).objects;
            const files = Object.keys(objects);
            const assetsMask = await context.execute("checkAssets", () => Promise.all(files.map(async (object) => {
                const { hash } = objects[object];
                const hashPath = minecraft.getAsset(hash);
                if (await exists(hashPath)) {
                    return (await computeChecksum(hashPath)) === hash;
                }
                return false;
            })));
            files.filter((_, i) => !assetsMask[i]).forEach((file) => { missingAssets[file] = objects[file].hash; });
        }

        return {
            minecraftLocation: minecraft,
            version,

            missingVersionJson: "",
            missingVersionJar: missingJar,
            missingAssetsIndex,

            missingLibraries,
            missingAssets,
        };
    };
}

export class ResolvedLibrary {
    constructor(readonly name: string, readonly download: Version.Artifact,
        readonly checksums?: string[], readonly serverreq?: boolean, readonly clientreq?: boolean) { }
}
export class ResolvedNative extends ResolvedLibrary {
    constructor(name: string, download: Version.Artifact, readonly extractExclude?: string[]) {
        super(name, download);
    }
}

export function resolveDependency(path: MinecraftLocation, version: string): Promise<ResolvedVersion[]> {
    const folder = typeof path === "string" ? new MinecraftFolder(path) : path;
    return new Promise<ResolvedVersion[]>((res, rej) => {
        const stack: ResolvedVersion[] = [];
        const versionJsonPath = folder.getVersionJson(version);
        function interal(jsonPath: string, versionName: string): Promise<ResolvedVersion[]> {
            if (!fs.existsSync(jsonPath)) {
                return Promise.reject({
                    type: "MissingVersionJson",
                    version: versionName,
                });
            }
            return fs.promises.readFile(jsonPath).then((value) => {
                const versionInst = parseVersionJson(value.toString());
                Object.defineProperty(versionInst, "_path", { value: paths.dirname(jsonPath) });
                versionInst.minecraftDirectory = folder.root;
                stack.push(versionInst);
                if (versionInst.inheritsFrom) {
                    return interal(folder.getVersionJson(versionInst.inheritsFrom), versionInst.inheritsFrom);
                } else {
                    return stack;
                }
            });
        }
        interal(versionJsonPath, version).then((r) => res(r), (e) => rej(e));
    });
}


function parseVersionHierarchy(hierarchy: ResolvedVersion[]): ResolvedVersion {
    if (hierarchy.length === 0) { throw new Error("The hierarchy cannot be empty!"); }
    const id: string = hierarchy[0].id;
    let assetIndex: Version.AssetIndex = hierarchy[0].assetIndex;
    let assets: string = "";

    const downloadsMap: { [key: string]: Version.Download } = {};
    const librariesMap: { [key: string]: ResolvedLibrary } = {};
    const nativesMap: { [key: string]: ResolvedNative } = {};

    let mainClass: string;
    let args: any;
    let minimumLauncherVersion: number = 0;
    const releaseTime: string = hierarchy[0].releaseTime;
    const time: string = hierarchy[0].time;
    let type: string;
    let logging: any;
    let client: string | undefined;
    let location: string;

    const chains: string[] = hierarchy.map((j) => Reflect.get(j, "_path"));

    let json: ResolvedVersion;
    do {
        json = hierarchy.pop() as ResolvedVersion;
        minimumLauncherVersion = Math.max(json.minimumLauncherVersion || 0, minimumLauncherVersion);
        location = json.minecraftDirectory;

        client = (json as any).jar || client || json.id;

        if (!args) {
            args = json.arguments;
        } else {
            if (json.arguments.game) {
                args.game.push(...json.arguments.game);
            } else if (json.arguments.jvm) {
                args.jvm.push(...json.arguments.jvm);
            }
        }

        logging = json.logging || logging;
        assets = json.assets || assets;
        type = json.type;
        mainClass = json.mainClass;
        if (json.assetIndex) { assetIndex = json.assetIndex; }
        if (json.libraries) {
            json.libraries.forEach((lib) => {
                if (lib instanceof ResolvedNative) {
                    nativesMap[lib.name] = lib;
                } else {
                    librariesMap[lib.name] = lib;
                }
            });
        }
        if (json.downloads) {
            for (const key in json.downloads) {
                downloadsMap[key] = json.downloads[key];
            }
        }
    } while (hierarchy.length !== 0);

    if (!mainClass) {
        throw {
            type: "CorruptedVersionJson",
            missing: "MainClass",
            version: id,
        };
    }
    if (!assetIndex) {
        throw {
            type: "CorruptedVersionJson",
            version: id,
            missing: "AssetIndex",
        };
    }

    return {
        id, assetIndex, assets, client,
        arguments: args,
        downloads: downloadsMap,
        libraries: Object.keys(librariesMap).map((k) => librariesMap[k]).concat(Object.keys(nativesMap).map((k) => nativesMap[k])),
        mainClass, minimumLauncherVersion, releaseTime, time, type, logging,
        pathChain: chains,
        minecraftDirectory: location,
    } as ResolvedVersion;
}

function checkAllowed(rules: Array<{ action?: string, os?: any }>, platform: ReturnType<typeof getPlatform>) {
    // by default it's allowed
    if (!rules) { return true; }
    // else it's disallow by default
    let allow = false;
    for (const rule of rules) {
        const action = rule.action === "allow";
        // apply by default
        let apply = true;
        if (rule.os) {
            // don't apply by default if has os rule
            apply = false;
            const osRule = rule.os;
            if (platform.name === osRule.name
                && (!osRule.version || platform.version.match(osRule.version))) {
                apply = true;
            }
        }
        if (apply) { allow = action; }
    }
    return allow;
}

export function resolveLibraries(libs: Version["libraries"], platform: ReturnType<typeof getPlatform> = getPlatform()) {
    const empty = new ResolvedLibrary("", { path: "", sha1: "", size: 0, url: "" });
    return libs.map((lib) => {
        if (lib.rules && !checkAllowed(lib.rules, platform)) { return empty; }
        if (lib.natives) {
            if (!lib.natives[platform.name]) { return empty; }
            const classifier = (lib.natives[platform.name] as string).replace("${arch}", platform.arch);
            const nativArt = lib.downloads.classifiers[classifier];
            if (!nativArt) { return empty; }
            return new ResolvedNative(lib.name, lib.downloads.classifiers[classifier], lib.extract ? lib.extract.exclude ? lib.extract.exclude : undefined : undefined);
        } else {
            if (lib.downloads) {
                if (!lib.downloads.artifact.url) {
                    lib.downloads.artifact.url = lib.name.split(":")[0] === "net.minecraftforge" ?
                        "https://files.minecraftforge.net/maven/" + lib.downloads.artifact.path
                        : "https://libraries.minecraft.net/" + lib.downloads.artifact.path;
                }
                return new ResolvedLibrary(lib.name, lib.downloads.artifact);
            }
            const maven = lib.url || "https://libraries.minecraft.net/";
            const path = parseLibPath(lib.name);
            const artifact: Version.Artifact = {
                size: -1,
                sha1: lib.checksums ? lib.checksums[0] : "",
                path,
                url: maven + path,
            };
            return new ResolvedLibrary(lib.name, artifact, lib.checksums, lib.serverreq, lib.clientreq);
        }
    }).filter((l) => l !== empty);
}

function parseVersionJson(versionString: string): ResolvedVersion {
    const platform = getPlatform();
    const parseArgs = (args: any) => {
        if (args.jvm) {
            args.jvm = args.jvm.map((a: string | any) => {
                if (typeof a === "object") { return checkAllowed(a.rules, platform) ? a.value : undefined; }
                return a;
            }).filter((a: any) => a !== undefined).reduce((a: string[], b: string | string[]) => {
                if (b instanceof Array) { a.push(...b); } else { a.push(b); }
                return a;
            }, []);
        }
        if (args.game) {
            args.game = args.game.filter((a: string) => typeof a === "string");
        }
        return args;
    };
    const parsed = JSON.parse(versionString, (key, value) => {
        if (key === "libraries") { return resolveLibraries(value, platform); }
        if (key === "arguments") { return parseArgs(value); }
        return value;
    });
    if (!parsed.arguments) {
        parsed.arguments = {
            game: parsed.minecraftArguments.split(" "),
            jvm: [
                {
                    rules: [
                        {
                            action: "allow",
                            os: {
                                name: "osx",
                            },
                        },
                    ],
                    value: [
                        "-XstartOnFirstThread",
                    ],
                },
                {
                    rules: [
                        {
                            action: "allow",
                            os: {
                                name: "windows",
                            },
                        },
                    ],
                    value: "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump",
                },
                {
                    rules: [
                        {
                            action: "allow",
                            os: {
                                name: "windows",
                                version: "^10\\.",
                            },
                        },
                    ],
                    value: [
                        "-Dos.name=Windows 10",
                        "-Dos.version=10.0",
                    ],
                },
                "-Djava.library.path=${natives_directory}",
                "-Dminecraft.launcher.brand=${launcher_name}",
                "-Dminecraft.launcher.version=${launcher_version}",
                "-cp",
                "${classpath}",
            ],
        };
        const jvms: string[] = [];
        parsed.arguments.jvm
            .filter((arg: Version.LaunchArgument) => typeof arg === "string" ? true : checkAllowed(arg.rules, platform) ? true : false)
            .forEach((arg: Version.LaunchArgument) => typeof arg === "string" ? jvms.push(arg) : arg.value instanceof Array ? jvms.push(...arg.value) : jvms.push(arg.value as string));
        parsed.arguments.jvm = jvms;
    }
    return parsed as ResolvedVersion;
}

export * from "@xmcl/common/version";
export default Version;
