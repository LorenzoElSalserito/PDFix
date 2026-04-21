#!/usr/bin/env bash
#
# PDFix deploy build script
#
# Produces a self-contained pdfix-deploy.tar.gz ready to be given to a
# sysadmin. The archive contains everything needed: frontend, backend,
# PHP dependencies, ICC profile, .htaccess and an install script.
#
# Requirements: Node.js >= 18, npm, curl (that's it)
#
# Usage:
#   chmod +x deploy/build.sh
#   ./deploy/build.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$PROJECT_ROOT/deploy"
DIST="$PROJECT_ROOT/dist"

echo "==> Cleaning previous build..."
rm -rf "$DIST"
mkdir -p "$DIST"

# --- Frontend ---
echo "==> Building frontend..."
cd "$PROJECT_ROOT/client"
npm ci --silent
npm run build
cp -r "$PROJECT_ROOT/client/dist/"* "$DIST/"

# --- Backend: PHP dependencies ---
echo "==> Fetching PHP dependencies..."
if command -v composer &> /dev/null; then
    echo "    (using Composer)"
    cd "$PROJECT_ROOT/server"
    composer install --no-dev --optimize-autoloader --quiet
    cp -r "$PROJECT_ROOT/server/vendor" "$DIST/vendor"
elif command -v php &> /dev/null; then
    echo "    (using php + composer.phar)"
    if [ ! -f "$SCRIPT_DIR/composer.phar" ]; then
        php -r "copy('https://getcomposer.org/installer', '/tmp/composer-setup.php');"
        php /tmp/composer-setup.php --install-dir="$SCRIPT_DIR" --quiet
        rm -f /tmp/composer-setup.php
    fi
    cd "$PROJECT_ROOT/server"
    php "$SCRIPT_DIR/composer.phar" install --no-dev --optimize-autoloader --quiet
    cp -r "$PROJECT_ROOT/server/vendor" "$DIST/vendor"
else
    echo "    (no PHP/Composer found -- downloading from GitHub)"
    bash "$SCRIPT_DIR/fetch-vendor.sh" "$DIST/vendor"
fi

# --- Backend: application code ---
echo "==> Assembling backend..."
cp -r "$PROJECT_ROOT/server/src" "$DIST/src"
mkdir -p "$DIST/api"
cp "$PROJECT_ROOT/server/public/index.php" "$DIST/api/index.php"

# --- .htaccess ---
echo "==> Writing .htaccess..."
cat > "$DIST/.htaccess" << 'HTACCESS'
RewriteEngine On

# Existing files and directories: serve directly
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# /api/* -> PHP backend
RewriteRule ^api(/.*)?$ api/index.php [QSA,L]

# Everything else -> Vue.js SPA
RewriteRule ^ index.html [L]
HTACCESS

# --- install.sh (included in the archive) ---
echo "==> Writing install.sh..."
cat > "$DIST/install.sh" << 'INSTALL'
#!/usr/bin/env bash
#
# PDFix -- one-command server installer
#
# Usage:
#   sudo bash install.sh [DOMAIN]
#
# Examples:
#   sudo bash install.sh pdfix.example.com
#   sudo bash install.sh                     # defaults to "localhost"

set -euo pipefail

DOMAIN="${1:-localhost}"
INSTALL_DIR="/var/www/pdfix"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  PDFix Installer"
echo "  Domain: $DOMAIN"
echo ""

# --- 1. Prerequisites ---
echo "[1/6] Checking prerequisites..."

missing=""
if ! command -v apache2 &> /dev/null && ! command -v httpd &> /dev/null; then
    missing="$missing apache2"
fi
if ! command -v php &> /dev/null; then
    missing="$missing php"
fi

if [ -n "$missing" ]; then
    echo ""
    echo "  Missing:$missing"
    echo ""
    echo "  Install with:"
    echo "    sudo apt update"
    echo "    sudo apt install apache2 php php-mbstring php-gd libapache2-mod-php"
    echo ""
    exit 1
fi

PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')
echo "  PHP $PHP_VER OK"

php -m | grep -qi mbstring || { echo "  ERROR: missing php-mbstring"; exit 1; }
php -m | grep -qi gd       || { echo "  ERROR: missing php-gd"; exit 1; }
echo "  Extensions OK"

# --- 2. Apache modules ---
echo "[2/6] Enabling mod_rewrite..."
a2enmod rewrite -q 2>/dev/null || true

# --- 3. Copy files ---
echo "[3/6] Copying to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
rsync -a --exclude='install.sh' "$SCRIPT_DIR/" "$INSTALL_DIR/"

# --- 4. Permissions ---
echo "[4/6] Setting permissions..."
chown -R www-data:www-data "$INSTALL_DIR"
find "$INSTALL_DIR" -type d -exec chmod 755 {} \;
find "$INSTALL_DIR" -type f -exec chmod 644 {} \;

# --- 5. VirtualHost ---
echo "[5/6] Configuring Apache..."
cat > /etc/apache2/sites-available/pdfix.conf << VHOST
<VirtualHost *:80>
    ServerName $DOMAIN

    DocumentRoot $INSTALL_DIR

    <Directory $INSTALL_DIR>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    php_value upload_max_filesize 50M
    php_value post_max_size 100M
    php_value memory_limit 256M
    php_value max_execution_time 120

    ErrorLog \${APACHE_LOG_DIR}/pdfix-error.log
    CustomLog \${APACHE_LOG_DIR}/pdfix-access.log combined
</VirtualHost>
VHOST

a2ensite pdfix.conf -q 2>/dev/null || true

# --- 6. Reload ---
echo "[6/6] Reloading Apache..."
systemctl reload apache2

echo ""
echo "  PDFix is live at: http://$DOMAIN"
echo ""
echo "  For HTTPS:"
echo "    sudo apt install certbot python3-certbot-apache"
echo "    sudo certbot --apache -d $DOMAIN"
echo ""
INSTALL
chmod +x "$DIST/install.sh"

# --- Archive ---
echo "==> Creating pdfix-deploy.tar.gz..."
ARCHIVE="$PROJECT_ROOT/pdfix-deploy.tar.gz"
tar -czf "$ARCHIVE" -C "$DIST" .

SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo ""
echo "==> Done! ($SIZE)"
echo ""
echo "  File: $ARCHIVE"
echo ""
echo "  Send it to your sysadmin. On the server:"
echo ""
echo "    mkdir /tmp/pdfix && tar xzf pdfix-deploy.tar.gz -C /tmp/pdfix"
echo "    sudo bash /tmp/pdfix/install.sh pdfix.example.com"
echo ""
