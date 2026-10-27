#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createPrivateKey, createSign, createVerify, generateKeyPairSync, X509Certificate } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const FORMAT = 'dsh-release-manifest-v1'
const ALGORITHM = 'RSA-SHA256'

function decodeBase64(value, field) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${field} is not canonical base64`)
  }
  return Buffer.from(value, 'base64')
}

function loadPrivateKey(file) {
  const bytes = fs.readFileSync(file)
  if (bytes.subarray(0, 11).toString('ascii') === '-----BEGIN ') return createPrivateKey(bytes)
  return createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' })
}

export function signReleaseManifest(manifest, privateKey) {
  const payload = Buffer.isBuffer(manifest) ? manifest : Buffer.from(manifest, 'utf8')
  if (payload.length === 0 || payload.length > 1 << 20) throw new Error('manifest size is outside the accepted range')
  const signer = createSign(ALGORITHM)
  signer.update(payload)
  signer.end()
  const signature = signer.sign(privateKey)
  return JSON.stringify({
    format: FORMAT,
    algorithm: ALGORITHM,
    payload: payload.toString('base64'),
    signature: signature.toString('base64'),
  }, null, 2) + '\n'
}

export function verifyReleaseManifest(envelopeText, publicKey) {
  const envelope = JSON.parse(envelopeText)
  if (envelope?.format !== FORMAT || envelope?.algorithm !== ALGORITHM) throw new Error('unsupported signed manifest format')
  const payload = decodeBase64(envelope.payload, 'payload')
  const signature = decodeBase64(envelope.signature, 'signature')
  if (payload.length === 0 || payload.length > 1 << 20 || signature.length === 0) throw new Error('signed manifest has invalid lengths')
  const verifier = createVerify(ALGORITHM)
  verifier.update(payload)
  verifier.end()
  if (!verifier.verify(publicKey, signature)) throw new Error('signed manifest signature is invalid')
  return new TextDecoder('utf-8', { fatal: true }).decode(payload)
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--self-test') options.selfTest = true
    else if (argv[i] === '--verify') options.verify = true
    else if (['--manifest', '--private-key', '--public-key', '--payload-file', '--out'].includes(argv[i])) {
      const key = argv[i].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`missing value for ${argv[i]}`)
      options[key] = argv[++i]
    } else throw new Error(`unknown argument: ${argv[i]}`)
  }
  return options
}

function runSelfTest() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const source = 'a'.repeat(64) + '  apk/dsh-mobile-apk-v1.0-arm64.apk  1\n'
  const signed = signReleaseManifest(source, privateKey)
  if (verifyReleaseManifest(signed, publicKey) !== source) throw new Error('signed manifest self-test round-trip failed')
  let rejected = false
  const tampered = JSON.parse(signed)
  tampered.payload = Buffer.from(source.replace(/^a/, 'b')).toString('base64')
  try { verifyReleaseManifest(JSON.stringify(tampered), publicKey) } catch { rejected = true }
  if (!rejected) throw new Error('signed manifest self-test accepted a modified payload')
  console.log('PASS signed release manifest self-test (valid signature and modified-payload rejection)')
}

function main() {
  let options
  try { options = parseArgs(process.argv.slice(2)) }
  catch (error) { throw new Error(error.message) }
  if (options.selfTest) return runSelfTest()
  if (options.verify) {
    if (!options.manifest || !options.publicKey || options.privateKey || options.out) {
      throw new Error('usage: sign-release-manifest.mjs --verify --manifest ENVELOPE --public-key CERT [--payload-file PAYLOAD]')
    }
    const certificate = new X509Certificate(fs.readFileSync(options.publicKey))
    const payload = verifyReleaseManifest(fs.readFileSync(options.manifest, 'utf8'), certificate.publicKey)
    if (options.payloadFile && !Buffer.from(payload, 'utf8').equals(fs.readFileSync(options.payloadFile))) {
      throw new Error('signed manifest payload does not match the expected payload file')
    }
    console.log('Verified signed release manifest')
    return
  }
  if (!options.manifest || !options.privateKey || !options.out) {
    throw new Error('usage: sign-release-manifest.mjs --manifest FILE --private-key FILE --out FILE')
  }
  const output = signReleaseManifest(fs.readFileSync(options.manifest), loadPrivateKey(options.privateKey))
  fs.writeFileSync(path.resolve(options.out), output, 'utf8')
  console.log(`Signed release manifest: ${path.basename(options.out)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() }
  catch (error) {
    console.error(`Release manifest signing failed: ${error.message}`)
    process.exitCode = 1
  }
}
