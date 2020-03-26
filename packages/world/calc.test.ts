import { BlockPos, Chunk, Region, getChunkForBlock, getRegionForChunk, getMinBlockForChunk, getMaxBlockForChunk, getChunk, getMinBlockForRegion, getMaxBlockForRegion, getMinChunkForRegion, getMaxChunkForRegion, getRegionName, getRegionFromName, getRegion, getRegionForBlock } from './calc';


interface Fixture {
	block: BlockPos;
	chunk: Chunk;
	region: Region;
}

/** 2D array to play nice with Jest's {@link test.each} */
const fixtures: Fixture[][] = [
	[{
		block: { x: 0, y: 0, z: 0 },
		chunk: {
			pos: { x: 0, y: 0, z: 0 },
			minBlock: { x: 0, y: 0, z: 0 },
			maxBlock: { x: 15, y: 15, z: 15 }
		},
		region: {
			name: "r.0.0.mca",
			pos: { x: 0, z: 0 },
			minChunk: { x: 0, y: 0, z: 0 },
			maxChunk: { x: 31, y: 15, z: 31 },
			minBlock: { x: 0, y: 0, z: 0 },
			maxBlock: { x: 511, y: 255, z: 511 }
		}
	}],
	
	[{
		block: { x: 456, y: 134, z: 761 },
		chunk: {
			pos: { x: 28, y: 8, z: 47 },
			minBlock: { x: 448, y: 128, z: 752 },
			maxBlock: { x: 463, y: 143, z: 767 }
		},
		region: {
			name: "r.0.1.mca",
			pos: { x: 0, z: 1 },
			minChunk: { x: 0, y: 0, z: 32 },
			maxChunk: { x: 31, y: 15, z: 63 },
			minBlock: { x: 0, y: 0, z: 512 },
			maxBlock: { x: 511, y: 255, z: 1023 }
		}
	}],
	
	[{
		block: { x: -921, y: 75, z: -321 },
		chunk: {
			pos: { x: -58, y: 4, z: -21 },
			minBlock: { x: -928, y: 64, z: -336 },
			maxBlock: { x: -913, y: 79, z: -321 }
		},
		region: {
			name: "r.-2.-1.mca",
			pos: { x: -2, z: -1 },
			minChunk: { x: -64, y: 0, z: -32 },
			maxChunk: { x: -33, y: 15, z: -1 },
			minBlock: { x: -1024, y: 0, z: -512 },
			maxBlock: { x: -513, y: 255, z: -1 }
		}
	}]
]



describe("Block", () => {
	test.each(fixtures)("getChunk", ({ block, chunk }) => {
		expect(chunk.pos).toEqual(getChunkForBlock(block));
	});
	
	test.each(fixtures)("getRegion", ({ block, region }) => {
		expect(region.pos).toEqual(getRegionForBlock(block));
	});
})

describe("Chunk", () => {
	test.each(fixtures)("minBlock", ({ chunk }) => {
		expect(chunk.minBlock).toEqual(getMinBlockForChunk(chunk.pos));
	});
	
	test.each(fixtures)("maxBlock", ({ chunk }) => {
		expect(chunk.maxBlock).toEqual(getMaxBlockForChunk(chunk.pos));
	});
	
	test.each(fixtures)("region", ({ chunk, region }) => {
		expect(region.pos).toEqual(getRegionForChunk(chunk.pos));
	});
	
	test.each(fixtures)("meta", ({ chunk }) => {
		expect(chunk).toEqual(getChunk(chunk.pos));
	});
})

describe("Region", () => {
	test.each(fixtures)("minBlock", ({ region }) => {
		expect(region.minBlock).toEqual(getMinBlockForRegion(region.pos));
	});
	
	test.each(fixtures)("maxBlock", ({ region }) => {
		expect(region.maxBlock).toEqual(getMaxBlockForRegion(region.pos));
	});
	
	test.each(fixtures)("minChunk", ({ region }) => {
		expect(region.minChunk).toEqual(getMinChunkForRegion(region.pos));
	});
	
	test.each(fixtures)("maxChunk", ({ region }) => {
		expect(region.maxChunk).toEqual(getMaxChunkForRegion(region.pos));
	});
	
	test.each(fixtures)("name", ({ region }) => {
		expect(region.name).toEqual(getRegionName(region.pos));
	});
	
	test.each(fixtures)("fromName", ({ region }) => {
		expect(region.pos).toEqual(getRegionFromName(region.name));
	});
	
	test.each(fixtures)("meta", ({ region }) => {
		expect(region).toEqual(getRegion(region.pos));
	});
})
