// Shamelessly "adapted" from https://dinnerbone.com/minecraft/tools/coordinates/


/**
 * Structurally equivalent to {@link ChunkPos}
 * Different name to document semantic difference
 */
export interface BlockPos {
	x: number;
	y: number;
	z: number;
}

/**
 * Structurally equivalent to {@link BlockPos}
 * Different name to document semantic difference
 */
export interface ChunkPos {
	x: number;
	y: number;
	z: number;
}

export interface RegionPos {
	x: number;
	z: number;
}



export interface Chunk {
	pos: ChunkPos;
	minBlock: BlockPos;
	maxBlock: BlockPos;
}

export interface Region {
	name: string;
	pos: RegionPos;
	
	minChunk: ChunkPos;
	maxChunk: ChunkPos;
	
	minBlock: BlockPos;
	maxBlock: BlockPos;
}



export function getMinBlockForChunk(chunk: ChunkPos): BlockPos {
    return {
        x: chunk.x * 16,
        y: chunk.y * 16,
        z: chunk.z * 16
    }
}

export function getMaxBlockForChunk(chunk: ChunkPos): BlockPos {
    return {
        x: (chunk.x + 1) * 16 - 1,
        y: (chunk.y + 1) * 16 - 1,
        z: (chunk.z + 1) * 16 - 1
    }
}


export function getMinBlockForRegion(region: RegionPos): BlockPos {
	//TODO could be more efficient by merging the calculation
	return getMinBlockForChunk(getMinChunkForRegion(region));
}

export function getMaxBlockForRegion(region: RegionPos): BlockPos {
	//TODO could be more efficient by merging the calculation
	return getMaxBlockForChunk(getMaxChunkForRegion(region));
}



export function getMinChunkForRegion(region: RegionPos): ChunkPos {
    return {
        x: region.x * 32,
        y: 0,
		z: region.z * 32,
    }
}

export function getMaxChunkForRegion(region: RegionPos): ChunkPos {
    return {
        x: (region.x + 1) * 32 - 1,
        y: 15,
        z: (region.z + 1) * 32 - 1
    }
}



export function getChunkForBlock(block: BlockPos): ChunkPos {
	return {
		x: Math.floor(block.x / 16),
    	y: Math.floor(block.y / 16),
		z: Math.floor(block.z / 16)
	}
}

export function getRegionForChunk(chunk: ChunkPos): RegionPos {
	return {
		x: Math.floor(chunk.x / 32),
		z: Math.floor(chunk.z / 32)
	}
}

export function getRegionForBlock(block: BlockPos): RegionPos {
	//TODO could be more efficient by merging the calculation
	return getRegionForChunk(getChunkForBlock(block));
}



export function getRegionName(region: RegionPos): string {
	return `r.${region.x}.${region.z}.mca`;
}

export function getRegionFromName(name: string): RegionPos | null {
	const match = name.match(/^\s*r\.(-?\d+)\.(-?\d+)\.mca\s*$/i);
    if (match) {
		return {
			x: parseInt(match[1], 10),
			z: parseInt(match[2], 10)
		}
    } else {
		// incorrect format
		return null; //XXX would it be better to throw an error?
	}
}



export function getChunk(pos: ChunkPos): Chunk {
	return {
		pos,
		minBlock: getMinBlockForChunk(pos),
		maxBlock: getMaxBlockForChunk(pos)
	}
}

export function getRegion(pos: RegionPos): Region {
	const minChunk = getMinChunkForRegion(pos);
	const maxChunk = getMaxChunkForRegion(pos);
	
	return {
		pos,
		name: getRegionName(pos),
		
		minChunk, maxChunk,
		
		minBlock: getMinBlockForChunk(minChunk),
		maxBlock: getMaxBlockForChunk(maxChunk)
	}
}
