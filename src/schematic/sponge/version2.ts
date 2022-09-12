import type { Int, Short, TagMap } from 'nbt-ts';
import { tagToRecord } from '../../util/nbt.js';
import type { Block } from '../types.js';
import { Schematic } from '../types.js';

const DEFAULT_DV = 1913;

export function loadVersion2(tag: TagMap): Schematic {
    const blocks = tag.get('BlockData') as Buffer;
    const width = (tag.get('Width') as Short).value;
    const height = (tag.get('Height') as Short).value;
    const length = (tag.get('Length') as Short).value;
    const dvTag = tag.get('DataVersion') as Int;
    const dataVersion = dvTag
        ? (tag.get('DataVersion') as Int).value
        : DEFAULT_DV;
    const metadataTag = tag.get('Metadata') as TagMap;

    const palette = new Map<number, Block>();
    // eslint-disable-next-line prefer-const
    for (let [key, value] of (tag.get('Palette') as TagMap).entries()) {
        // sanitize the block name
        const colonIndex = key.indexOf(':');
        if (colonIndex !== -1) {
            key = key.substring(colonIndex + 1);
        }

        const properties = {};

        const bracketIndex = key.indexOf('[');
        let type: string;
        if (bracketIndex !== -1) {
            type = key.substring(0, bracketIndex);
            const propertyArea = key.substring(
                bracketIndex + 1,
                key.length - 1
            ) as string;
            let skip = '';
            propertyArea.split(',').forEach(prop => {
                const pair = prop.split('=');

                // FLIP START
                if (pair[0] === skip) {
                    return;
                }
                if (pair[0] === 'facing') {
                    if (pair[1] === 'north') {
                        properties[pair[0]] = 'south';
                        return;
                    } else if (pair[1] === 'south') {
                        properties[pair[0]] = 'north';
                        return;
                    }
                } else if (pair[0] === 'north' && pair[1] === 'true') {
                    if (propertyArea.includes('south=false')) {
                        properties['north'] = 'false';
                        properties['south'] = 'true';
                        skip = 'south';
                        return;
                    }
                } else if (pair[0] === 'north' && pair[1] === 'false') {
                    if (propertyArea.includes('south=true')) {
                        properties['north'] = 'true';
                        properties['south'] = 'false';
                        skip = 'south';
                        return;
                    }
                } else if (pair[0] === 'south' && pair[1] === 'true') {
                    if (propertyArea.includes('north=false')) {
                        properties['north'] = 'true';
                        properties['south'] = 'false';
                        skip = 'north';
                        return;
                    }
                } else if (pair[0] === 'south' && pair[1] === 'false') {
                    if (propertyArea.includes('north=true')) {
                        properties['north'] = 'false';
                        properties['south'] = 'true';
                        skip = 'north';
                        return;
                    }
                }
                // FLIP END

                properties[pair[0]] = pair[1];
            });
        } else {
            type = key;
        }

        palette.set((value as Int).value, { type, properties });
    }

    const metadata: Record<string, unknown> = metadataTag
        ? tagToRecord(metadataTag)
        : {};

    const schematic = new Schematic({
        width,
        height,
        length,
        blockTypes: [...palette.values()],
        dataVersion,
        metadata,
        format: {
            type: 'sponge',
            version: (tag.get('Version') as Int).value
        }
    });
    let index = 0;
    let i = 0;
    while (i < blocks.length) {
        let value = 0;
        let varintLength = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            value |= (blocks[i] & 127) << (varintLength++ * 7);
            if (varintLength > 5) {
                throw new Error('VarInt too big');
            }
            if ((blocks[i] & 128) != 128) {
                i++;
                break;
            }
            i++;
        }

        const y = Math.floor(index / (width * length));
        const z = Math.floor((index % (width * length)) / width);
        const x = (index % (width * length)) % width;

        index++;

        const block = palette.get(value);
        schematic.setBlock({ x, y, z }, block);
    }

    return schematic;
}
