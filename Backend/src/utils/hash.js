import { keccak256, toUtf8Bytes } from 'ethers';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const arr = value.map((v) => JSON.parse(stableStringify(v)));
    return JSON.stringify(arr);
  }
  const keys = Object.keys(value).sort();
  const obj = {};
  for (const k of keys) {
    obj[k] = JSON.parse(stableStringify(value[k]));
  }
  return JSON.stringify(obj);
}

export function canonicalize(obj) {
  return stableStringify(obj);
}

export function computeDataHash(snapshot) {
  const canonical = canonicalize(snapshot);
  return keccak256(toUtf8Bytes(canonical));
}
