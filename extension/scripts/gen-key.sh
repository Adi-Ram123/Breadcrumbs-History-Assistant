#!/usr/bin/env bash
# Generate a fixed manifest "key" so the extension id (and the backend's CORS origin
# and the extension's storage) stay the same across rebuilds and machines.
# Prints the public key for wxt.config.ts and the resulting extension id.
# The private key is discarded: the Chrome Web Store signs published builds itself.
set -euo pipefail
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
openssl genrsa -out "$tmp/key.pem" 2048 2>/dev/null
openssl rsa -in "$tmp/key.pem" -pubout -outform DER -out "$tmp/pub.der" 2>/dev/null
key=$(base64 < "$tmp/pub.der" | tr -d '\n')
id=$(shasum -a 256 "$tmp/pub.der" | cut -c1-32 | tr '0-9a-f' 'a-p')
echo "key: $key"
echo "id:  $id"
