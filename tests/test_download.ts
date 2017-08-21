import { Version } from '../src/version';
import * as assert from 'assert';
import { ForgeVersionMetaList } from '../src/forge_download';
import { ForgeVersionMeta } from "../index";
import { MinecraftFolder } from '../src/file_struct';
import { DOWN_R } from "../src/utils";
import { LiteVersionMeta, LiteVersionMetaList } from '../src/lite_download';
describe('FetchVersionList', () => {
    it('should not fetch a list duplicatedly', (done) => {
        let r1: any
        Version.updateVersionMeta().then(result => {
            r1 = result
            return Version.updateVersionMeta({ fallback: result })
        }).then(result => {
            assert.equal(result, r1)
            done()
        }).catch(err => done(err))
    })
})

describe('FetchForgeVersionList', () => {
    it('should not fetch a list twice', (done) => {
        let r1: any
        ForgeVersionMetaList.update().then(result => {
            r1 = result
            return ForgeVersionMetaList.update({ fallback: result })
        }).then(result => {
            assert.equal(result, r1)
            done()
        }).catch(err => done(err))
    }).timeout(5000)
})
// describe('FetchForge', () => {
//     it('should download forge', done => {
//         ForgeVersionMetaList.update().then((result: { list: ForgeVersionMetaList, date: string }) => {
//             return result.list.number[result.list.promos['latest'].toString()]
//         }).then(meta => {
//             return ForgeVersionMeta.installForge(meta, new MinecraftLocation('./tests/assets/temp'), false)
//         }).then(v => {
//             console.log(v)
//             done()
//         }, err => { done() })
//     }).timeout(10000)
// })
describe('FetchLite', () => {
    it('should download liteloader', done => {
        LiteVersionMetaList.update()
            .then((result: { list: LiteVersionMetaList, date: string }) => {
                let meta = result.list.versions['1.10.2'].release
                if (meta) {
                    let promise = LiteVersionMeta.installLiteloader(meta, new MinecraftFolder('./tests/assets/temp'))
                    return promise.then(v => '')
                }
                return ''
            }).then((r: any) => {
                done()
            }, (e: any) => done(e))
    }).timeout(10000)
})
