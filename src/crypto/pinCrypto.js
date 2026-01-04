import argon2 from "argon2";
import crypto from "crypto";

export function makeSalt32() {
  return crypto.randomBytes(32);
}

export async function hashPin(pin, salt32) {
  return argon2.hash(pin, {
    type: argon2.argon2id,
    salt: salt32,
    timeCost: 3,
    memoryCost: 65536,
    parallelism: 1
  });
}

export async function verifyPin(pin, hash) {
  return argon2.verify(hash, pin);
}
