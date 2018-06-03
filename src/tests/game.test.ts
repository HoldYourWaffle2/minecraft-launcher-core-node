import * as assert from 'assert';
import * as fs from 'fs';
import {
    GameSetting, TextComponent,
    Language, Mod, ResourcePack, WorldInfo,
} from '../index';

describe('TextComponent', () => {
    it('normal text converting', () => {
        const raw = 'testCommon tesxt'
        assert.equal(TextComponent.from(raw).unformatted, raw)
    })
    it('string to TextComponent and reverse convention', () => {
        const raw = '§1colored§r'
        assert.equal(TextComponent.from(raw).formatted, raw)
    })
})
describe("GameSetting", function () {
    it('should parse all options', function () {
        // const s = fs.readFileSync(`${this.assets}/options.txt`).toString()
        const s = `
        version:512
invertYMouse:false
mouseSensitivity:0.47887325
fov:0.0
gamma:1.0
saturation:0.0
renderDistance:12
guiScale:0
particles:1
bobView:true
anaglyph3d:false
maxFps:120
fboEnable:true
difficulty:1
fancyGraphics:false
ao:1
renderClouds:false
resourcePacks:["Xray Ultimate 1.12 v2.2.1.zip"]
incompatibleResourcePacks:[]
lastServer:play.mcndsj.com
lang:en_US
chatVisibility:0
chatColors:true
chatLinks:true
chatLinksPrompt:true
chatOpacity:1.0
snooperEnabled:true
fullscreen:false
enableVsync:true
useVbo:true
hideServerAddress:false
advancedItemTooltips:false
pauseOnLostFocus:true
touchscreen:false
overrideWidth:0
overrideHeight:0
heldItemTooltips:true
chatHeightFocused:1.0
chatHeightUnfocused:0.44366196
chatScale:1.0
chatWidth:1.0
showInventoryAchievementHint:false
mipmapLevels:4
forceUnicodeFont:false
reducedDebugInfo:false
useNativeTransport:true
entityShadows:true
mainHand:right
attackIndicator:1
showSubtitles:false
realmsNotifications:true
enableWeakAttacks:false
autoJump:true
key_key.attack:-100
key_key.use:-99
key_key.forward:17
key_key.left:30
key_key.back:31
key_key.right:32
key_key.jump:57
key_key.sneak:42
key_key.sprint:29
key_key.drop:16
key_key.inventory:18
key_key.chat:28
key_key.playerlist:15
key_key.pickItem:-98
key_key.command:53
key_key.screenshot:60
key_key.togglePerspective:63
key_key.smoothCamera:0
key_key.fullscreen:87
key_key.spectatorOutlines:0
key_key.swapHands:33
key_key.hotbar.1:2
key_key.hotbar.2:3
key_key.hotbar.3:4
key_key.hotbar.4:5
key_key.hotbar.5:6
key_key.hotbar.6:7
key_key.hotbar.7:8
key_key.hotbar.8:9
key_key.hotbar.9:10
soundCategory_master:1.0
soundCategory_music:1.0
soundCategory_record:1.0
soundCategory_weather:1.0
soundCategory_block:1.0
soundCategory_hostile:1.0
soundCategory_neutral:1.0
soundCategory_player:1.0
soundCategory_ambient:1.0
soundCategory_voice:1.0
modelPart_cape:true
modelPart_jacket:true
modelPart_left_sleeve:true
modelPart_right_sleeve:true
modelPart_left_pants_leg:true
modelPart_right_pants_leg:true
modelPart_hat:true
`
        const set = GameSetting.parse(s)
        assert(set);
        assert.equal(set.ao, 1)
        assert.equal(set.fov, 0)
        assert.equal(set.mipmapLevels, 4)
        assert.deepEqual(set.resourcePacks, ['Xray Ultimate 1.12 v2.2.1.zip'])
        assert.equal(set.lang, 'en_US')
    })
    it('should not parse illegal option', () => {
        const set = GameSetting.parse('undefined:undefined\n')
        assert(set);
        assert.equal((set as any)['undefined'], undefined)
    })
    it('should parse output even if input string is empty', () => {
        const set = GameSetting.parse('')
        assert(set);
        assert.equal(set.ao, 2)
        assert.equal(set.fov, 0)
        assert.equal(set.mipmapLevels, 4)
        assert.deepEqual(set.resourcePacks, [])
        assert.equal(set.lang, 'en_us')
    })
    it('should write all options from frame', () => {
        const setting: GameSetting.Frame = {
            useVbo: false,
            fboEnable: false,
            enableVsync: false,
            fancyGraphics: false,
            renderClouds: false,
            forceUnicodeFont: false,
            autoJump: false,
            entityShadows: false,
            ao: 0,
            fov: 0,
            mipmapLevels: 0,
            maxFps: 0,
            particles: 0,
            renderDistance: 0,
            resourcePacks: ['asb']
        }
        const string = GameSetting.stringify(setting);
        assert.notEqual(string.indexOf('maxFps:0'), -1);
        assert.notEqual(string.indexOf('fboEnable:false'), -1);
        assert.notEqual(string.indexOf('enableVsync:false'), - 1);
        assert.notEqual(string.indexOf('fancyGraphics:false'), - 1);
        assert.notEqual(string.indexOf('resourcePacks:["asb"]'), -1);
    })
    it('should write all options from instance', () => {
        const setting: GameSetting.Frame = {
            useVbo: false,
            fboEnable: false,
            enableVsync: false,
            fancyGraphics: false,
            renderClouds: false,
            forceUnicodeFont: false,
            autoJump: false,
            entityShadows: false,
            ao: 0,
            fov: 0,
            mipmapLevels: 0,
            maxFps: 0,
            particles: 0,
            renderDistance: 0,
            resourcePacks: []
        }
        const inst = new GameSetting(setting);
        const string = GameSetting.stringify(inst);
        assert.notEqual(string.indexOf('maxFps:0'), -1);
        assert.notEqual(string.indexOf('fboEnable:false'), -1);
        assert.notEqual(string.indexOf('enableVsync:false'), - 1);
        assert.notEqual(string.indexOf('fancyGraphics:false'), - 1);
        assert.notEqual(string.indexOf('resourcePacks:[]'), -1);
    })
    it('should not write undefined', () => {
        const setting = {
            undefined: undefined,
        }
        const string = GameSetting.stringify(setting);
        assert.equal(string.indexOf('undefined:undefined'), -1);
    })
})
describe('Resourcepack', function () {
    it('should read resource pack correctly', async function () {
        const buff = fs.readFileSync(`${this.assets}/sample-resourcepack.zip`)
        const pack = await ResourcePack.read(`${this.assets}/sample-resourcepack.zip`, buff)
        if (!pack) throw new Error('Pack cannot be null');
        assert.equal(pack.description, 'Vattic\u0027s Faithful 32x32 pack');
        assert.equal(pack.format, 1);
    })
    it('should read resource pack folder', async function () {
        const pack = await ResourcePack.readFolder(`${this.assets}/sample-resourcepack`);
        if (!pack) throw new Error('Pack cannot be null');
        assert.equal(pack.description, 'Vattic\u0027s Faithful 32x32 pack');
        assert.equal(pack.format, 1);
    })
})
describe('Language', () => {
    it('no successful version reading', (done) => {
        Language.read('./', '1.12').catch(e => {
            assert.equal(e.type, 'MissingVersionIndex')
            done()
        })
    })
})
