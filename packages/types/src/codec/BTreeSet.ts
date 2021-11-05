// Copyright 2017-2021 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { HexString } from '@polkadot/util/types';
import type { CodecHash, Hash } from '../interfaces/runtime';
import type { AnyJson, Codec, Constructor, ISet, Registry } from '../types';

import { compactFromU8a, compactToU8a, isHex, isU8a, logger, stringify, u8aConcat, u8aToHex, u8aToU8a } from '@polkadot/util';

import { compareSet, decodeU8a, sortSet, typeToConstructor } from './utils';

const l = logger('BTreeSet');

/** @internal */
function decodeSetFromU8a<V extends Codec> (registry: Registry, ValClass: Constructor<V>, u8a: Uint8Array): [Set<V>, number] {
  const output = new Set<V>();
  const [offset, length] = compactFromU8a(u8a);
  const [values, decodedLength] = decodeU8a<V>(registry, u8a.subarray(offset), new Array(length.toNumber()).fill(ValClass));

  for (let i = 0; i < values.length; i++) {
    output.add(values[i]);
  }

  return [output, decodedLength + offset];
}

/** @internal */
function decodeSetFromSet<V extends Codec> (registry: Registry, ValClass: Constructor<V>, value: Set<any> | string[]): [Set<V>, number] {
  const output = new Set<V>();

  value.forEach((val: any) => {
    try {
      output.add((val instanceof ValClass) ? val : new ValClass(registry, val));
    } catch (error) {
      l.error('Failed to decode key or value:', (error as Error).message);

      throw error;
    }
  });

  return [output, 0];
}

/**
 * Decode input to pass into constructor.
 *
 * @param ValClass - Type of the map value
 * @param value - Value to decode, one of:
 * - null
 * - undefined
 * - hex
 * - Uint8Array
 * - Set<any>, where both key and value types are either
 *   constructors or decodeable values for their types.
 * @param jsonSet
 * @internal
 */
function decodeSet<V extends Codec> (registry: Registry, valType: Constructor<V> | string, value?: Uint8Array | string | string[] | Set<any>): [Set<V>, number] {
  if (!value) {
    return [new Set<V>(), 0];
  }

  const ValClass = typeToConstructor(registry, valType);

  if (isU8a(value) || isHex(value)) {
    return decodeSetFromU8a<V>(registry, ValClass, u8aToU8a(value));
  } else if (Array.isArray(value) || value instanceof Set) {
    return decodeSetFromSet<V>(registry, ValClass, value);
  }

  throw new Error('BTreeSet: cannot decode type');
}

export class BTreeSet<V extends Codec = Codec> extends Set<V> implements ISet<V> {
  public readonly registry: Registry;

  public createdAtHash?: Hash;

  readonly initialU8aLength?: number;

  readonly #ValClass: Constructor<V>;

  constructor (registry: Registry, valType: Constructor<V> | string, rawValue?: Uint8Array | string | string[] | Set<any>) {
    const [values, decodedLength] = decodeSet(registry, valType, rawValue);

    super(sortSet(values));

    this.registry = registry;
    this.initialU8aLength = decodedLength;
    this.#ValClass = typeToConstructor(registry, valType);
  }

  public static with<V extends Codec> (valType: Constructor<V> | string): Constructor<BTreeSet<V>> {
    return class extends BTreeSet<V> {
      constructor (registry: Registry, value?: Uint8Array | string | Set<any>) {
        super(registry, valType, value);
      }
    };
  }

  /**
   * @description The length of the value when encoded as a Uint8Array
   */
  public get encodedLength (): number {
    let len = compactToU8a(this.size).length;

    for (const v of this.values()) {
      len += v.encodedLength;
    }

    return len;
  }

  /**
   * @description Returns a hash of the value
   */
  public get hash (): CodecHash {
    return this.registry.hash(this.toU8a());
  }

  /**
   * @description Checks if the value is an empty value
   */
  public get isEmpty (): boolean {
    return this.size === 0;
  }

  /**
   * @description The actual set values as a string[]
   */
  public get strings (): string[] {
    return [...super.values()].map((v) => v.toString());
  }

  /**
   * @description Compares the value of the input to see if there is a match
   */
  public eq (other?: unknown): boolean {
    return compareSet(this, other);
  }

  /**
   * @description Returns a hex string representation of the value. isLe returns a LE (number-only) representation
   */
  public toHex (): HexString {
    return u8aToHex(this.toU8a());
  }

  /**
   * @description Converts the Object to to a human-friendly JSON, with additional fields, expansion and formatting of information
   */
  public toHuman (isExtended?: boolean): AnyJson {
    const json: AnyJson = [];

    for (const v of this.values()) {
      json.push(v.toHuman(isExtended));
    }

    return json;
  }

  /**
   * @description Converts the Object to JSON, typically used for RPC transfers
   */
  public toJSON (): AnyJson {
    const json: AnyJson = [];

    for (const v of this.values()) {
      json.push(v.toJSON());
    }

    return json;
  }

  /**
   * @description Returns the base runtime type name for this instance
   */
  public toRawType (): string {
    return `BTreeSet<${this.registry.getClassName(this.#ValClass) || new this.#ValClass(this.registry).toRawType()}>`;
  }

  /**
   * @description Returns the string representation of the value
   */
  public override toString (): string {
    return stringify(this.toJSON());
  }

  /**
   * @description Encodes the value as a Uint8Array as per the SCALE specifications
   * @param isBare true when the value has none of the type-specific prefixes (internal)
   */
  public toU8a (isBare?: boolean): Uint8Array {
    const encoded = new Array<Uint8Array>();

    if (!isBare) {
      encoded.push(compactToU8a(this.size));
    }

    for (const v of this.values()) {
      encoded.push(v.toU8a(isBare));
    }

    return u8aConcat(...encoded);
  }
}
