import { spawn } from "child_process";
import * as fs from "fs";
import { AnnotationVisitor, ClassReader, ClassVisitor, Opcodes } from "java-asm";
import * as path from "path";
import { finished, Readable } from "stream";
import Task from "treelike-task";
import { promisify } from "util";
import { Entry, ZipFile } from "yauzl";
import { bufferEntry, createExtractStream, createParseStream, open, openEntryReadStream, parseEntries, walkEntries } from "yauzlw";
import { installLibraries } from "./download";
import { computeChecksum, ensureDir, ensureFile, exists, multiChecksum, remove } from "./utils/common";
import { MinecraftFolder, MinecraftLocation } from "./utils/folder";
import { downloadFileWork, got } from "./utils/network";
import { Library, parseLibPath as parseLibPath, parseLibraries, Version } from "./version";

async function findMainClass(lib: string) {
    const zip = await open(lib, { lazyEntries: true, autoClose: false });
    const { "META-INF/MANIFEST.MF": manifest } = await parseEntries(zip, ["META-INF/MANIFEST.MF"]);
    let mainClass: string | undefined;
    if (manifest) {
        const content = await bufferEntry(zip, manifest).then((b) => b.toString());
        const mainClassPair = content.split("\n").map((l) => l.split(": ")).filter((arr) => arr[0] === "Main-Class")[0];
        if (mainClassPair) {
            mainClass = mainClassPair[1].trim();
        }
    }
    zip.close();
    return mainClass;
}

export namespace Forge {
    class AVisitor extends AnnotationVisitor {
        constructor(readonly map: { [key: string]: any }) { super(Opcodes.ASM5); }
        public visit(s: string, o: any) {
            this.map[s] = o;
        }
    }
    class KVisitor extends ClassVisitor {
        public fields: any = {};
        private className: string = "";
        public constructor(readonly map: { [key: string]: any }) {
            super(Opcodes.ASM5);
        }
        visit(version: number, access: number, name: string, signature: string, superName: string, interfaces: string[]): void {
            this.className = name;
        }
        public visitField(access: number, name: string, desc: string, signature: string, value: any) {
            if (this.className === "Config") {
                this.fields[name] = value;
            }
            return null;
        }

        public visitAnnotation(desc: string, visible: boolean): AnnotationVisitor | null {
            if (desc === "Lnet/minecraftforge/fml/common/Mod;" || desc === "Lcpw/mods/fml/common/Mod;") { return new AVisitor(this.map); }
            return null;
        }
    }
    export interface Config {
        [category: string]: {
            comment?: string,
            properties: Array<Config.Property<any>>,
        };
    }

    export namespace Config {
        export type Type = "I" | "D" | "S" | "B";
        export interface Property<T = number | boolean | string | number[] | boolean[] | string[]> {
            readonly type: Type;
            readonly name: string;
            readonly comment?: string;
            value: T;
        }

        export function stringify(config: Config) {
            let content = "# Configuration file\n\n\n";
            const propIndent = "    ", arrIndent = "        ";
            Object.keys(config).forEach((cat) => {
                content += `${cat} {\n\n`;
                config[cat].properties.forEach((prop) => {
                    if (prop.comment) {
                        const lines = prop.comment.split("\n");
                        for (const l of lines) {
                            content += `${propIndent}# ${l}\n`;
                        }
                    }
                    if (prop.value instanceof Array) {
                        content += `${propIndent}${prop.type}:${prop.name} <\n`;
                        prop.value.forEach((v) => content += `${arrIndent}${v}\n`);
                        content += `${propIndent}>\n`;
                    } else {
                        content += `${propIndent}${prop.type}:${prop.name}=${prop.value}\n`;
                    }
                    content += "\n";
                });
                content += `}\n\n`;
            });
            return content;
        }

        export function parse(body: string): Config {
            const lines = body.split("\n").map((s) => s.trim())
                .filter((s) => s.length !== 0);
            let category: string | undefined;
            let pendingCategory: string | undefined;

            const parseVal = (type: Type, value: any) => {
                const map: { [key: string]: (s: string) => any } = {
                    I: Number.parseInt,
                    D: Number.parseFloat,
                    S: (s: string) => s,
                    B: (s: string) => s === "true",
                };
                const handler = map[type];
                return handler(value);
            };
            const config: Config = {};
            let inlist = false;
            let comment: string | undefined;
            let last: any;

            const readProp = (type: Type, line: string) => {
                line = line.substring(line.indexOf(":") + 1, line.length);
                const pair = line.split("=");
                if (pair.length === 0 || pair.length === 1) {
                    let value;
                    let name;
                    if (line.endsWith(" <")) {
                        value = [];
                        name = line.substring(0, line.length - 2);
                        inlist = true;
                    } else { }
                    if (!category) {
                        throw {
                            type: "CorruptedForgeConfig",
                            reason: "MissingCategory",
                            line,
                        };
                    }
                    config[category].properties.push(last = { name, type, value, comment } as Property);
                } else {
                    inlist = false;
                    if (!category) {
                        throw {
                            type: "CorruptedForgeConfig",
                            reason: "MissingCategory",
                            line,
                        };
                    }
                    config[category].properties.push({ name: pair[0], value: parseVal(type, pair[1]), type, comment } as Property);
                }
                comment = undefined;
            };
            for (const line of lines) {
                if (inlist) {
                    if (!last) {
                        throw {
                            type: "CorruptedForgeConfig",
                            reason: "CorruptedList",
                            line,
                        };
                    }
                    if (line === ">") { inlist = false; } else if (line.endsWith(" >")) {
                        last.value.push(parseVal(last.type, line.substring(0, line.length - 2)));
                        inlist = false;
                    } else { last.value.push(parseVal(last.type, line)); }
                    continue;
                }
                switch (line.charAt(0)) {
                    case "#":
                        if (!comment) {
                            comment = line.substring(1, line.length).trim();
                        } else {
                            comment = comment.concat("\n", line.substring(1, line.length).trim());
                        }
                        break;
                    case "I":
                    case "D":
                    case "S":
                    case "B":
                        readProp(line.charAt(0) as Type, line);
                        break;
                    case "<":
                        break;
                    case "{":
                        if (pendingCategory) {
                            category = pendingCategory;
                            config[category] = { comment, properties: [] };
                            comment = undefined;
                        } else {
                            throw {
                                type: "CorruptedForgeConfig",
                                reason: "MissingCategory",
                                line,
                            };
                        }
                        break;
                    case "}":
                        category = undefined;
                        break;
                    default:
                        if (!category) {
                            if (line.endsWith("{")) {
                                category = line.substring(0, line.length - 1).trim();
                                config[category] = { comment, properties: [] };
                                comment = undefined;
                            } else {
                                pendingCategory = line;
                            }
                        } else {
                            throw {
                                type: "CorruptedForgeConfig",
                                reason: "Duplicated",
                                line,
                            };
                        }
                }
            }
            return config;
        }
    }

    export interface ModIndentity {
        readonly modid: string;
        readonly version: string;
    }
    export interface MetaData extends ModIndentity {
        readonly modid: string;
        readonly name: string;
        readonly description?: string;
        readonly version: string;
        readonly mcversion?: string;
        readonly acceptedMinecraftVersions?: string;
        readonly updateJSON?: string;
        readonly url?: string;
        readonly logoFile?: string;
        readonly authorList?: string[];
        readonly credits?: string;
        readonly parent?: string;
        readonly screenShots?: string[];
        readonly fingerprint?: string;
        readonly dependencies?: string;
        readonly accpetRemoteVersions?: string;
        readonly acceptSaveVersions?: string;
        readonly isClientOnly?: boolean;
        readonly isServerOnly?: boolean;
    }

    export interface VersionMeta {
        installer: {
            md5: string;
            sha1: string;
            path: string;
        };
        universal: {
            md5: string;
            sha1: string;
            path: string;
        };
        mcversion: string;
        version: string;
    }

    async function asmMetaData(zip: ZipFile, entry: Entry, modidTree: any) {
        const data = await bufferEntry(zip, entry);
        const metaContainer: any = {};
        const visitor = new KVisitor(metaContainer);
        new ClassReader(data).accept(visitor);
        if (Object.keys(metaContainer).length === 0) {
            if (visitor.fields && visitor.fields.OF_NAME) {
                metaContainer.modid = visitor.fields.OF_NAME;
                metaContainer.name = visitor.fields.OF_NAME;
                metaContainer.mcversion = visitor.fields.MC_VERSION;
                metaContainer.version = `${visitor.fields.OF_EDITION}_${visitor.fields.OF_RELEASE}`;
                metaContainer.description = "OptiFine is a Minecraft optimization mod. It allows Minecraft to run faster and look better with full support for HD textures and many configuration options.";
                metaContainer.authorList = ["sp614x"];
                metaContainer.url = "https://optifine.net";
                metaContainer.isClientOnly = true;
            }
        }
        const modid = metaContainer.modid;
        let modMeta = modidTree[modid];
        if (!modMeta) {
            modMeta = {};
            modidTree[modid] = modMeta;
        }

        for (const propKey in metaContainer) {
            modMeta[propKey] = metaContainer[propKey];
        }
    }

    async function jsonMetaData(zip: ZipFile, entry: Entry, modidTree: any) {
        try {
            const json = JSON.parse(await bufferEntry(zip, entry).then((b) => b.toString("utf-8")));
            if (json instanceof Array) {
                for (const m of json) { modidTree[m.modid] = m; }
            } else if (json.modList instanceof Array) {
                for (const m of json.modList) { modidTree[m.modid] = m; }
            } else if (json.modid) {
                modidTree[json.modid] = json;
            }
        } catch (e) { }
    }

    async function regulize(mod: Buffer | string | ZipFile) {
        let zip;
        if (mod instanceof Buffer || typeof mod === "string") {
            zip = await open(mod, { lazyEntries: true, autoClose: false });
        } else {
            zip = mod;
        }
        return zip;
    }
    /**
     * Read metadata of the input mod.
     *
     * @param mod The mod path or data
     * @param asmOnly True for only reading the metadata from java bytecode, ignoring the mcmod.info
     */
    export async function readModMetaData(mod: Buffer | string | ZipFile, asmOnly: boolean = false) {
        const zip = await regulize(mod);
        const modidTree: any = {};
        const promise: Array<Promise<void>> = [];
        await walkEntries(zip, (entry) => {
            if (!asmOnly && entry.fileName === "mcmod.info") {
                promise.push(jsonMetaData(zip, entry, modidTree));
            } else if (entry.fileName.endsWith(".class")) {
                promise.push(asmMetaData(zip, entry, modidTree));
            }
            return false;
        });
        await Promise.all(promise);
        const modids = Object.keys(modidTree);
        if (modids.length === 0) { throw { type: "NonmodTypeFile" }; }
        return modids.map((k) => modidTree[k] as Forge.MetaData)
            .filter((m) => m.modid !== undefined);
    }

    export async function meta(mod: Buffer | string | ZipFile, asmOnly: boolean = false) {
        return readModMetaData(mod, asmOnly);
    }

    export const DEFAULT_FORGE_MAVEN = "http://files.minecraftforge.net";

    interface LaunchProfile extends Version.Raw {
        data: {
            [key: string]: {
                client: string,
                server: string,
            },
        };
        processors: Array<{
            jar: string,
            classpath: string[],
            args: string[],
            outputs?: {
                [key: string]: string,
            },
        }>;
    }

    function installByInstallerTask(version: VersionMeta, minecraft: MinecraftLocation, maven: string, java: string, tempDir?: string, clearTempDir: boolean = true) {
        return async (context: Task.Context) => {
            const mc = typeof minecraft === "string" ? new MinecraftFolder(minecraft) : minecraft;
            const forgeVersion = `${version.mcversion}-${version.version}`;
            const jarPath = mc.getLibraryByPath(`net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}.jar`);
            const fullVersion = `${version.mcversion}-forge${version.mcversion}-${version.version}`;
            const rootPath = mc.getVersionRoot(fullVersion);
            const jsonPath = path.join(rootPath, `${fullVersion}.json`);

            const installerURLFallback = `${maven}/maven/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
            const installerURL = `${maven}${version.installer.path}`;

            function downloadInstallerTask(installer: string, dest: string) {
                return async (ctx: Task.Context) => {
                    let inStream;
                    if (fs.existsSync(dest)) {
                        const [md5, sha1] = await multiChecksum(dest, ["md5", "sha1"]);
                        if (md5 === version.installer.md5 && sha1 === version.installer.sha1) {
                            inStream = fs.createReadStream(dest);
                        }
                    }
                    if (!inStream) {
                        inStream = got.stream(installer, {
                            method: "GET",
                            headers: { connection: "keep-alive" },
                        }).on("error", () => { })
                            .on("downloadProgress", (progress) => { ctx.update(progress.transferred, progress.total as number); });

                        inStream.pipe(fs.createWriteStream(dest));
                    }

                    return inStream.pipe(createParseStream({ autoClose: false, lazyEntries: true }))
                        .promise();
                };
            }

            const temp = tempDir || await fs.promises.mkdtemp(mc.root + path.sep);
            const installJar = path.join(temp, "forge-installer.jar");

            function processValue(v: string) {
                if (v.match(/^\[.+\]$/g)) {
                    const targetId = v.substring(1, v.length - 1);
                    return mc.getLibraryByPath(parseLibPath(targetId));
                }
                return v;
            }
            function processMapping(data: LaunchProfile["data"], m: string) {
                m = processValue(m);
                if (m.match(/^{.+}$/g)) {
                    const key = m.substring(1, m.length - 1);
                    m = data[key].client;
                }
                return m;
            }
            async function processVersionJson(s: Version.Raw) {
                await ensureFile(jsonPath);
                await fs.promises.writeFile(jsonPath, JSON.stringify(s));
            }
            async function processExtract(s: Readable, p: string) {
                const file = path.join(temp, p);
                await ensureFile(file);
                await promisify(finished)(s.pipe(fs.createWriteStream(file)));
            }
            try {
                let zip: ZipFile;
                try {
                    zip = await context.execute("downloadInstaller", downloadInstallerTask(installerURL, installJar));
                } catch {
                    zip = await context.execute("downloadInstaller", downloadInstallerTask(installerURLFallback, installJar));
                }
                let profile!: LaunchProfile;
                let versionJson!: Version.Raw;
                await new Promise<void>((resolve, reject) => {
                    let foundProfile = false, foundBin = false, foundVersion = false, foundUniversal = false, foundForge = false;
                    const forgeEntry = `maven/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}.jar`;
                    const forgeUniversalEntry = `maven/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-universal.jar`;
                    const binEntry = "data/client.lzma";
                    zip.once("end", () => {
                        if (!foundProfile || !foundBin || !foundVersion || !foundUniversal || !foundForge) {
                            reject({ foundProfile, foundBin, foundVersion, foundUniversal, foundForge });
                        } else {
                            resolve();
                        }
                    });
                    zip.on("entry", (entry: Entry) => {
                        function shouldContinue() {
                            if (!foundProfile || !foundBin || !foundVersion || !foundUniversal || !foundForge) {
                                zip.readEntry();
                            } else {
                                zip.close();
                                resolve();
                            }
                        }
                        if (entry.fileName === "install_profile.json") {
                            bufferEntry(zip, entry).then((b) => b.toString()).then(JSON.parse).then((obj) => {
                                foundProfile = true;
                                profile = obj;
                                shouldContinue();
                            });
                        } else if (entry.fileName === "version.json") {
                            bufferEntry(zip, entry).then((b) => b.toString()).then(JSON.parse).then((obj) => {
                                foundVersion = true;
                                versionJson = obj;
                                return processVersionJson(versionJson);
                            }).then(() => {
                                shouldContinue();
                            });
                        } else if (entry.fileName === binEntry) {
                            openEntryReadStream(zip, entry).then((s) => processExtract(s, binEntry)).then(() => {
                                foundBin = true;
                                shouldContinue();
                            });
                        } else if (entry.fileName === forgeEntry) {
                            openEntryReadStream(zip, entry).then((s) => processExtract(s, forgeEntry)).then(() => {
                                foundForge = true;
                                shouldContinue();
                            });
                        } else if (entry.fileName === forgeUniversalEntry) {
                            openEntryReadStream(zip, entry).then((s) => processExtract(s, forgeUniversalEntry)).then(() => {
                                foundUniversal = true;
                                shouldContinue();
                            });
                        } else {
                            zip.readEntry();
                        }
                    });
                    zip.readEntry();
                });

                profile.data.MINECRAFT_JAR = {
                    client: mc.getVersionJar(version.mcversion),
                    server: "",
                };
                for (const key in profile.data) {
                    const value = profile.data[key];
                    value.client = processValue(value.client);
                    value.server = processValue(value.server);

                    if (key === "BINPATCH") {
                        value.client = path.join(temp, value.client);
                        value.server = path.join(temp, value.server);
                    }
                }
                for (const proc of profile.processors) {
                    proc.args = proc.args.map((a) => processMapping(profile.data, a));
                    if (proc.outputs) {
                        const replacedOutput: LaunchProfile["processors"][0]["outputs"] = {};
                        for (const key in proc.outputs) {
                            replacedOutput[processMapping(profile.data, key)] = processMapping(profile.data, proc.outputs[key]);
                        }
                        proc.outputs = replacedOutput;
                    }
                }

                function libRedirect(lib: Library) {
                    if (lib.name.startsWith("net.minecraftforge:forge:")) {
                        return `file://${path.join(temp, "maven", lib.download.path)}`;
                    }
                    return undefined;
                }

                await context.execute("downloadLibraries", installLibraries({
                    libraries: parseLibraries([...profile.libraries, ...versionJson.libraries]),
                }, mc, { libraryHost: libRedirect }));

                await context.execute("postProcessing", async (ctx) => {
                    ctx.update(0, profile.processors.length);
                    let i = 0;
                    for (const proc of profile.processors) {
                        const jarRealPath = mc.getLibraryByPath(parseLibPath(proc.jar));
                        const mainClass = await findMainClass(jarRealPath);
                        if (!mainClass) { throw new Error(`Cannot find main class for processor ${proc.jar}.`); }
                        const cp = [...proc.classpath, proc.jar].map(parseLibPath).map((p) => mc.getLibraryByPath(p)).join(path.delimiter);
                        const cmd = ["-cp", cp, mainClass, ...proc.args];

                        await new Promise<void>((resolve, reject) => {
                            const process = spawn(java, cmd, { cwd: tempDir });
                            process.on("error", (error) => {
                                reject(error);
                            });
                            process.on("close", (code, signal) => {
                                if (code !== 0) {
                                    reject();
                                } else {
                                    resolve();
                                }
                            });
                            process.on("exit", (code, signal) => {
                                if (code !== 0) {
                                    reject();
                                } else {
                                    resolve();
                                }
                            });
                            process.stdout.setEncoding("utf-8");
                            process.stdout.on("data", (buf) => {
                                // console.error(buf.toString("utf-8"));
                            });
                            process.stderr.setEncoding("utf-8");
                            process.stderr.on("data", (buf) => {
                                console.error(buf.toString("utf-8"));
                            });
                        });
                        i += 1;
                        ctx.update(i, profile.processors.length);
                        if (proc.outputs) {
                            for (const file in proc.outputs) {
                                const sha1 = await computeChecksum(file, "sha1");
                                const expected = proc.outputs[file].replace(/\'/g, "");
                                if (sha1 !== expected) {
                                    throw new Error(`Fail to process ${proc.jar} @ ${file} since its validation failed. ${sha1} vs ${expected}`);
                                }
                            }
                        }
                    }

                    if (clearTempDir) {
                        await remove(temp);
                    }
                    i += 1;
                    ctx.update(i, profile.processors.length);
                });
                return fullVersion;
            } catch (e) {
                if (clearTempDir) {
                    await remove(temp);
                }
                throw e;
            }
        };
    }

    function installByUniversalTask(version: VersionMeta, minecraft: MinecraftLocation, maven: string, checkDependecies: boolean) {
        return async (context: Task.Context) => {
            const mc = typeof minecraft === "string" ? new MinecraftFolder(minecraft) : minecraft;
            const forgeVersion = `${version.mcversion}-${version.version}`;
            const jarPath = mc.getLibraryByPath(`net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}.jar`);
            const fullVersion = `${version.mcversion}-forge${version.mcversion}-${version.version}`;
            const rootPath = mc.getVersionRoot(fullVersion);
            const jsonPath = path.join(rootPath, `${fullVersion}.json`);

            const universalURLFallback = `${maven}/maven/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-universal.jar`;
            const universalURL = `${maven}${version.universal}`;

            await context.execute("installForgeJar", async () => {
                if (await exists(jarPath)) {
                    const [md5, sha1] = await multiChecksum(jarPath, ["md5", "sha1"]);
                    if (version.universal.md5 === md5 && version.universal.sha1 === sha1) {
                        return;
                    }
                }

                try {
                    await context.execute("downloadJar", downloadFileWork({ url: universalURL, destination: jarPath }));
                } catch  {
                    await context.execute("redownloadJar", downloadFileWork({ url: universalURLFallback, destination: jarPath }));
                }
            });

            await context.execute("installForgeJson", async () => {
                if (await exists(jsonPath)) { return; }

                await ensureDir(rootPath);
                await fs.createReadStream(jarPath).pipe(createExtractStream(path.dirname(jsonPath), ["version.json"])).promise();
                await fs.promises.rename(path.resolve(path.dirname(jsonPath), "version.json"), jsonPath);
            });

            if (checkDependecies) {
                const resolvedVersion = await Version.parse(minecraft, fullVersion);
                context.execute("checkDependencies", Version.checkDependenciesTask(resolvedVersion, minecraft).work);
            }

            return fullVersion;
        };
    }

    /**
     * Install forge to target location.
     * Installation task for forge with mcversion >= 1.13 requires java installed on your pc.
     * @param version The forge version meta
     */
    export function install(version: VersionMeta, minecraft: MinecraftLocation, option?: {
        maven?: string,
        java?: string,
        tempDir?: string,
        clearTempDirAfterInstall?: boolean,
    }) {
        return installTask(version, minecraft, option).execute();
    }

    /**
     * Install forge to target location.
     * Installation task for forge with mcversion >= 1.13 requires java installed on your pc.
     * @param version The forge version meta
     */
    export function installTask(version: VersionMeta, minecraft: MinecraftLocation, option: {
        maven?: string,
        forceCheckDependencies?: boolean,
        java?: string,
        tempDir?: string,
        clearTempDirAfterInstall?: boolean,
    } = {}): Task<string> {
        let byInstaller = true;
        try {
            const minorVersion = Number.parseInt(version.mcversion.split(".")[1], 10);
            byInstaller = minorVersion >= 13;
        } catch { }
        const work = byInstaller ? installByInstallerTask(version, minecraft, option.maven || DEFAULT_FORGE_MAVEN, option.java || "java", option.tempDir, option.clearTempDirAfterInstall)
            : installByUniversalTask(version, minecraft, option.maven || DEFAULT_FORGE_MAVEN, option.forceCheckDependencies === true);
        return Task.create("installForge", work);
    }
}

export default Forge;
