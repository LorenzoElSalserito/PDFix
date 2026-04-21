#!/usr/bin/env bash
#
# Downloads TCPDF and FPDI from GitHub and assembles a vendor/ directory
# with a pre-written autoloader. No PHP or Composer required.
#
# Usage: ./deploy/fetch-vendor.sh <output-vendor-dir>

set -euo pipefail

VENDOR="${1:?Usage: fetch-vendor.sh <output-vendor-dir>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TCPDF_TAG="6.7.5"
FPDI_TAG="2.6.1"

mkdir -p "$VENDOR"

echo "  Downloading TCPDF ${TCPDF_TAG}..."
curl -sL "https://github.com/tecnickcom/TCPDF/archive/refs/tags/${TCPDF_TAG}.tar.gz" -o "/tmp/tcpdf.tar.gz"
mkdir -p "$VENDOR/tecnickcom/tcpdf"
tar xzf /tmp/tcpdf.tar.gz -C "$VENDOR/tecnickcom/tcpdf" --strip-components=1
rm -f /tmp/tcpdf.tar.gz
# Remove TCPDF examples and docs (not needed in production)
rm -rf "$VENDOR/tecnickcom/tcpdf/examples" \
       "$VENDOR/tecnickcom/tcpdf/tools" \
       "$VENDOR/tecnickcom/tcpdf/CHANGELOG.TXT" \
       "$VENDOR/tecnickcom/tcpdf/README.md"

echo "  Downloading FPDI ${FPDI_TAG}..."
curl -sL "https://github.com/Setasign/FPDI/archive/refs/tags/v${FPDI_TAG}.tar.gz" -o "/tmp/fpdi.tar.gz"
mkdir -p "$VENDOR/setasign/fpdi"
tar xzf /tmp/fpdi.tar.gz -C "$VENDOR/setasign/fpdi" --strip-components=1
rm -f /tmp/fpdi.tar.gz

echo "  Copying autoload.php..."
cp "$SCRIPT_DIR/autoload.php" "$VENDOR/autoload.php"

echo "  Vendor directory ready: $VENDOR"
