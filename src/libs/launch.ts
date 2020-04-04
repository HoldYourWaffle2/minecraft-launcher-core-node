import { ChildProcess, ExecOptions, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { v4 } from "uuid";
import { createExtractStream } from "yauzlw";
import { Auth } from "./auth";
import { computeChecksum, ensureDir, format, missing } from "./utils/common";
import { MinecraftFolder } from "./utils/folder";
import { Native, Version } from "./version";


export namespace Launcher {
    export type PartialAuth = Pick<Auth, "selectedProfile" | "accessToken" | "userType" | "properties">;
    export interface Option {
        /**
         * The auth information
         */
        auth?: PartialAuth;
        launcherName?: string;
        launcherBrand?: string;

        /**
         * The path for saves/logs/configs
         */
        gamePath: string;
        /**
         * The path for assets/mods/resource packs
         */
        resourcePath?: string;
        javaPath: string;

        minMemory?: number;
        maxMemory?: number;
        version: string | Version;
        server?: { ip: string, port?: number };
        resolution?: { width?: number, height?: number, fullscreen: false };
        extraJVMArgs?: string[];
        extraMCArgs?: string[];
        extraExecOption?: ExecOptions;
        isDemo?: boolean;

        /**
         * Support yushi's yggdrasil agent https://github.com/to2mbn/authlib-injector/wiki
         */
        yggdrasilAgent?: {
            jar: string,
            server: string,
        };

        ignoreInvalidMinecraftCertificates?: boolean;
        ignorePatchDiscrepancies?: boolean;
    }

    export interface ServerOptions {
        javaPath: string;
        /**
         * Minecraft location
         */
        path: string;
        /**
         * Current working directory. Default is the same with the path.
         */
        cwd?: string;
        version: string | Version;

        nogui?: boolean;

        minMemory?: number;
        maxMemory?: number;
        extraJVMArgs?: string[];
        extraMCArgs?: string[];
        extraExecOption?: ExecOptions;
    }

    export async function launchServer(options: ServerOptions) {
        const args = await generateArgumentsServer(options);
        const version = options.version as Version;
        const minecraftFolder = new MinecraftFolder(options.path);

        await ensureLibraries(minecraftFolder, version);

        return spawn(args[0], args.slice(1), { cwd: options.cwd || options.path, env: process.env });
    }

    /**
     * Launch the minecraft as a child process. This function use spawn to create child process. To use an alternative way, see function generateArguments.
     *
     * This function will also check if the runtime libs are completed, and will extract native libs if needed.
     *
     * @param options The detail options for this launching.
     * @see ChildProcess
     * @see spawn
     * @see generateArguments
     */
    export async function launch(options: Option): Promise<ChildProcess> {
        const args = await generateArguments(options);
        const version = options.version as Version;
        const minecraftFolder = new MinecraftFolder(options.resourcePath as string);

        const jarPath = minecraftFolder.getVersionJar(version.client);
        if (!fs.existsSync(jarPath)) {
            throw {
                type: "MissingVersionJar",
                version: version.client,
            };
        }
        if (await computeChecksum(jarPath, "sha1") !== version.downloads.client.sha1) {
            throw {
                type: "CorruptedVersionJar",
                version: version.client,
            };
        }

        await ensureLibraries(minecraftFolder, version);
        await ensureNative(minecraftFolder, version);

        return spawn(args[0], args.slice(1), { cwd: options.gamePath, env: process.env });
    }

    export async function generateArgumentsServer(options: ServerOptions) {
        const { javaPath, path: gamePath, version, minMemory = 1024, maxMemory = 1024, extraJVMArgs = [], extraMCArgs = [], extraExecOption = {} } = options;
        const mc = new MinecraftFolder(gamePath);
        const resolvedVersion = typeof version === "string" ? await Version.parse(mc, version) : version;
        const cmd = [
            javaPath, `-Xms${(minMemory)}M`, `-Xmx${(maxMemory)}M`, ...extraJVMArgs,
            "-jar",
            mc.getVersionJar(resolvedVersion.client, "server"),
            ...extraMCArgs,
        ];
        if (options.nogui) {
            cmd.push("nogui");
        }
        options.version = resolvedVersion;

        return cmd;
    }

    /**
     * Generate the arguments array by options. This function is useful if you want to launch the process by yourself.
     *
     * This function will NOT check if the runtime libs are completed, and WONT'T check or extract native libs.
     *
     */
    export async function generateArguments(options: Option) {
        if (!options.version) { throw new Error("Version cannot be null!"); }
        if (!options.auth) { options.auth = Auth.offline("Steve"); }
        if (!path.isAbsolute(options.gamePath)) { options.gamePath = path.resolve(options.gamePath); }
        if (!options.resourcePath) { options.resourcePath = options.gamePath; }
        if (!options.minMemory) { options.minMemory = 512; }
        if (!options.maxMemory) { options.maxMemory = options.minMemory; }
        if (!options.launcherName) { options.launcherName = "Launcher"; }
        if (!options.launcherBrand) { options.launcherBrand = "0.0.1"; }
        if (!options.isDemo) { options.isDemo = false; }
        options.version = typeof options.version === "string" ? await Version.parse(options.resourcePath, options.version) : options.version;

        const mc = new MinecraftFolder(options.resourcePath);
        const version = options.version;
        const cmd: string[] = [];
        cmd.push(options.javaPath);

        cmd.push(`-Xms${(options.minMemory)}M`);
        cmd.push(`-Xmx${(options.maxMemory)}M`);

        if (options.ignoreInvalidMinecraftCertificates) {
            cmd.push("-Dfml.ignoreInvalidMinecraftCertificates=true");
        }
        if (options.ignorePatchDiscrepancies) {
            cmd.push("-Dfml.ignorePatchDiscrepancies=true");
        }

        if (options.yggdrasilAgent) {
            cmd.push(`-javaagent:${options.yggdrasilAgent.jar}=${options.yggdrasilAgent.server}`);
        }
        // add extra jvm args
        if (options.extraJVMArgs) { cmd.push(...options.extraJVMArgs); }

        const jvmOptions = {
            natives_directory: (mc.getNativesRoot(version.id)),
            launcher_name: options.launcherName,
            launcher_version: options.launcherBrand,
            classpath: `${[...version.libraries.map((lib) => mc.getLibraryByPath(lib.download.path)),
            mc.getVersionJar(version.client)]
                .join(path.delimiter)}`,
        };
        cmd.push(...version.arguments.jvm.map((arg) => format(arg as string, jvmOptions)));

        cmd.push(version.mainClass);
        const assetsDir = path.join(options.resourcePath, "assets");
        const resolution = options.resolution || { width: 850, height: 470 };
        const mcOptions = {
            version_name: version.id,
            version_type: version.type,
            assets_root: (assetsDir),
            game_assets: (assetsDir),
            assets_index_name: version.assets,
            game_directory: (options.gamePath),
            auth_player_name: options.auth.selectedProfile ? options.auth.selectedProfile.name || "Steve" : "Steve",
            auth_uuid: options.auth.selectedProfile.id.replace(/-/g, ""),
            auth_access_token: options.auth.accessToken || v4(),
            user_properties: JSON.stringify(options.auth.properties || {}),
            user_type: options.auth.userType || "mojang",
            resolution_width: resolution.width || 850,
            resolution_height: resolution.height || 470,
        };

        cmd.push(...version.arguments.game.map((arg) => format(arg as string, mcOptions)));

        if (options.extraMCArgs) { cmd.push(...options.extraMCArgs); }
        if (options.server) {
            cmd.push("--server"); cmd.push(options.server.ip);
            if (options.server.port) {
                cmd.push("--port"); cmd.push(options.server.port.toString());
            }
        }
        if (options.resolution) {
            if (options.resolution.fullscreen) {
                cmd.push("--fullscreen");
            } else {
                if (options.resolution.height) {
                    cmd.push(`--height ${options.resolution.height}`);
                }
                if (options.resolution.width) {
                    cmd.push(`--width ${options.resolution.width}`);
                }
            }
        }
        return cmd;
    }

    export async function ensureLibraries(resourcePath: MinecraftFolder, version: Version) {
        const missingMask = await Promise.all(version.libraries.map((lib) => missing(resourcePath.getLibraryByPath(lib.download.path))));
        const missingLibs = version.libraries.filter((_, index) => missingMask[index]);

        if (missingLibs.length > 0) {
            throw {
                type: "MissingLibs",
                libs: missingLibs,
            };
        }
        const corruptedMask = await Promise.all(version.libraries
            .map((lib) => computeChecksum(resourcePath.getLibraryByPath(lib.download.path))
                .then((sum) => lib.download.sha1 !== "" && sum !== lib.download.sha1)),
        );
        const corruptedLibs = version.libraries.filter((_, index) => corruptedMask[index]);

        if (corruptedLibs.length > 0) {
            throw {
                type: "CorruptedLibs",
                libs: corruptedLibs,
            };
        }
    }

    export async function ensureNative(mc: MinecraftFolder, version: Version) {
        const native = mc.getNativesRoot(version.id);
        await ensureDir(native);
        const natives = version.libraries.filter((lib) => lib instanceof Native) as Native[];
        return Promise.all(natives.map(async (n) => {
            const excluded: string[] = n.extractExclude ? n.extractExclude : [];
            const containsExcludes = (p: string) => excluded.filter((s) => p.startsWith(s)).length === 0;
            const notInMetaInf = (p: string) => p.indexOf("META-INF/") === -1;
            const notSha1AndNotGit = (p: string) => !(p.endsWith(".sha1") || p.endsWith(".git"));
            const from = mc.getLibraryByPath(n.download.path);
            await fs.createReadStream(from)
                .pipe(createExtractStream(native, (entry) =>
                    containsExcludes(entry.fileName) && notInMetaInf(entry.fileName) && notSha1AndNotGit(entry.fileName),
                ))
                .promise();
        }));
    }
}

export default Launcher;
