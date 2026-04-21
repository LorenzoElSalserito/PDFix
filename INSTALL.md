# PDFix -- Installation Guide

This document explains how to install PDFix on a server starting from the
pre-built `pdfix-deploy.tar.gz` archive. No build tools (Node.js, Composer)
are needed on the server -- the archive is fully self-contained.


## What is inside the archive

```
pdfix-deploy.tar.gz
  ├── index.html          Web interface (pre-built)
  ├── assets/             CSS and JavaScript bundles
  ├── api/
  │   └── index.php       Backend API
  ├── vendor/             PHP libraries (TCPDF, FPDI)
  ├── src/
  │   ├── Merger.php      PDF merge logic
  │   └── Converter.php   PDF/A conversion logic
  ├── .htaccess           Apache URL routing rules
  └── install.sh          Automated installer script
```

The ICC color profile required for PDF/A-1b is already shipped inside TCPDF,
so no external profile file is needed.


## Server requirements

- **OS**: Debian 11+, Ubuntu 20.04+ (or any Linux with Apache and PHP)
- **Apache** 2.4 with `mod_rewrite`
- **PHP** >= 7.4 with extensions `mbstring` and `gd`

On a fresh Debian/Ubuntu server, install everything with:

```bash
sudo apt update
sudo apt install apache2 php php-mbstring php-gd libapache2-mod-php
```


## Installation

There are two ways to install: automated (recommended) or manual.

### Option 1 -- Automated installer (recommended)

Transfer the archive to the server, extract it, and run the installer:

```bash
# Copy the archive to the server (from your local machine)
scp pdfix-deploy.tar.gz user@server:/tmp/

# On the server
ssh user@server
mkdir /tmp/pdfix
tar xzf /tmp/pdfix-deploy.tar.gz -C /tmp/pdfix
sudo bash /tmp/pdfix/install.sh pdfix.example.com
```

Replace `pdfix.example.com` with your actual domain or subdomain. If you omit
the domain, the installer defaults to `localhost`.

The installer performs the following steps automatically:

1. Checks that Apache and PHP are installed with the required extensions
2. Enables `mod_rewrite`
3. Copies the application files to `/var/www/pdfix`
4. Sets ownership to `www-data` and correct file permissions (755/644)
5. Creates and enables an Apache VirtualHost for the specified domain
6. Reloads Apache

When it finishes, PDFix is immediately accessible at `http://your-domain`.


### Option 2 -- Manual installation

If you prefer to do it by hand, or your server uses a non-standard layout:

#### 1. Extract the archive to the web root

```bash
sudo mkdir -p /var/www/pdfix
sudo tar xzf pdfix-deploy.tar.gz -C /var/www/pdfix
sudo rm /var/www/pdfix/install.sh
```

#### 2. Set file permissions

```bash
sudo chown -R www-data:www-data /var/www/pdfix
sudo find /var/www/pdfix -type d -exec chmod 755 {} \;
sudo find /var/www/pdfix -type f -exec chmod 644 {} \;
```

#### 3. Enable mod_rewrite

```bash
sudo a2enmod rewrite
```

#### 4. Create an Apache VirtualHost

Create the file `/etc/apache2/sites-available/pdfix.conf`:

```apache
<VirtualHost *:80>
    ServerName pdfix.example.com

    DocumentRoot /var/www/pdfix

    <Directory /var/www/pdfix>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    php_value upload_max_filesize 50M
    php_value post_max_size 100M
    php_value memory_limit 256M
    php_value max_execution_time 120

    ErrorLog ${APACHE_LOG_DIR}/pdfix-error.log
    CustomLog ${APACHE_LOG_DIR}/pdfix-access.log combined
</VirtualHost>
```

Replace `pdfix.example.com` with your domain.

#### 5. Enable the site and reload Apache

```bash
sudo a2ensite pdfix.conf
sudo systemctl reload apache2
```


## Verify the installation

Check that the backend API responds:

```bash
curl -s http://pdfix.example.com/api/health
```

Expected output:

```json
{
    "status": "ok",
    "php": "7.4.x",
    "extensions": {
        "mbstring": true,
        "gd": true
    }
}
```

Then open `http://pdfix.example.com` in a browser. You should see the PDFix
upload interface. Try uploading two PDF files and clicking "Unisci PDF".


## Adding HTTPS

Using Let's Encrypt with Certbot:

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d pdfix.example.com
```

Certbot will obtain a certificate, configure Apache to use it, and set up
automatic renewal. After this step PDFix will be available at
`https://pdfix.example.com`.


## Updating

To update PDFix to a new version, generate a new `pdfix-deploy.tar.gz` from
the development machine (`./deploy/build.sh`), then on the server:

```bash
sudo tar xzf pdfix-deploy.tar.gz -C /var/www/pdfix
sudo chown -R www-data:www-data /var/www/pdfix
```

No Apache restart is needed -- PHP picks up the new files immediately.


## Installing on a subdirectory instead of a domain

If you do not have a dedicated domain/subdomain and want to run PDFix under
a path like `http://example.com/pdfix/`, the setup is slightly different.

#### 1. Extract to a subdirectory of the existing DocumentRoot

```bash
sudo mkdir -p /var/www/html/pdfix
sudo tar xzf pdfix-deploy.tar.gz -C /var/www/html/pdfix
sudo rm /var/www/html/pdfix/install.sh
sudo chown -R www-data:www-data /var/www/html/pdfix
```

#### 2. Edit the .htaccess

Open `/var/www/html/pdfix/.htaccess` and add a `RewriteBase`:

```apache
RewriteEngine On
RewriteBase /pdfix/

# Existing files and directories: serve directly
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# /api/* -> PHP backend
RewriteRule ^api(/.*)?$ api/index.php [QSA,L]

# Everything else -> Vue.js SPA
RewriteRule ^ index.html [L]
```

#### 3. Make sure AllowOverride is enabled

In your existing VirtualHost (or in `/etc/apache2/apache2.conf`), the
`<Directory>` that covers `/var/www/html` must have `AllowOverride All`.


## Troubleshooting

### The page is blank (white screen)

The frontend files were not extracted correctly. Verify that `index.html`
and the `assets/` directory exist inside the DocumentRoot:

```bash
ls -la /var/www/pdfix/index.html /var/www/pdfix/assets/
```

### 404 on /api routes

`mod_rewrite` is not enabled, or `AllowOverride` is not set to `All`.
Check both:

```bash
apache2ctl -M | grep rewrite     # should show rewrite_module
grep -r "AllowOverride" /etc/apache2/sites-enabled/pdfix.conf
```

### 403 Forbidden

File permissions are incorrect. Re-run:

```bash
sudo chown -R www-data:www-data /var/www/pdfix
sudo find /var/www/pdfix -type d -exec chmod 755 {} \;
sudo find /var/www/pdfix -type f -exec chmod 644 {} \;
```

### 413 Request Entity Too Large

The PHP upload limits are being overridden by the global `php.ini`. Edit
`/etc/php/8.x/apache2/php.ini` and set:

```ini
upload_max_filesize = 50M
post_max_size = 100M
```

Then restart Apache: `sudo systemctl restart apache2`.

### 500 Internal Server Error

Check the Apache error log:

```bash
sudo tail -50 /var/log/apache2/pdfix-error.log
```

Common causes:
- Missing PHP extensions (`php-mbstring`, `php-gd`)
- PHP version below 7.4
- Corrupt or incomplete extraction of the archive

### API returns "Autoload non trovato"

The `vendor/` directory is missing or was not extracted. Re-extract the
archive and verify:

```bash
ls /var/www/pdfix/vendor/autoload.php
```


## Uninstallation

```bash
sudo rm -rf /var/www/pdfix
sudo a2dissite pdfix.conf
sudo rm /etc/apache2/sites-available/pdfix.conf
sudo systemctl reload apache2
```
