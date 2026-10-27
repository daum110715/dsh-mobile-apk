import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { signReleaseManifest, verifyReleaseManifest } from './sign-release-manifest.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const manifest = `${'ab'.repeat(32)}  apk/dsh-mobile-apk-v1.0-arm64.apk  123\n`

test('signed release manifest verifies with its independent public key', () => {
  const envelope = signReleaseManifest(manifest, privateKey)
  assert.equal(verifyReleaseManifest(envelope, publicKey), manifest)
})

test('modified payload is rejected before manifest parsing', () => {
  const envelope = signReleaseManifest(manifest, privateKey)
  const changed = envelope.replace(Buffer.from(manifest).toString('base64'), Buffer.from(manifest.replace('123', '124')).toString('base64'))
  assert.throws(() => verifyReleaseManifest(changed, publicKey), /signature is invalid/)
})

test('modified signature is rejected', () => {
  const envelope = signReleaseManifest(manifest, privateKey)
  const parsed = JSON.parse(envelope)
  parsed.signature = Buffer.alloc(Buffer.from(parsed.signature, 'base64').length, 0).toString('base64')
  assert.throws(() => verifyReleaseManifest(JSON.stringify(parsed), publicKey), /signature is invalid/)
})

test('unknown formats and non-canonical base64 are rejected', () => {
  const envelope = JSON.parse(signReleaseManifest(manifest, privateKey))
  assert.throws(() => verifyReleaseManifest(JSON.stringify({ ...envelope, algorithm: 'SHA1withRSA' }), publicKey), /unsupported/)
  assert.throws(() => verifyReleaseManifest(JSON.stringify({ ...envelope, payload: envelope.payload + '!' }), publicKey), /canonical base64/)
})

test('empty and oversized payloads are rejected', () => {
  assert.throws(() => signReleaseManifest('', privateKey), /size/)
  assert.throws(() => signReleaseManifest(Buffer.alloc((1 << 20) + 1), privateKey), /size/)
  const envelope = signReleaseManifest(manifest, privateKey)
  const { publicKey: otherPublicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  assert.throws(() => verifyReleaseManifest(envelope, otherPublicKey), /signature is invalid/)
})
