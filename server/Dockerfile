FROM php:7.4-apache

RUN apt-get update && apt-get install -y \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    unzip \
    git \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install gd mbstring \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

# PHP upload limits
RUN echo "upload_max_filesize = 50M" > /usr/local/etc/php/conf.d/uploads.ini \
    && echo "post_max_size = 100M" >> /usr/local/etc/php/conf.d/uploads.ini \
    && echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/uploads.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY server/composer.json server/composer.lock* ./
RUN composer install --no-dev --optimize-autoloader || composer install --no-dev

COPY server/src/ ./src/
COPY server/public/ ./public/

# Apache config: point document root to /app/public
RUN sed -i 's|/var/www/html|/app/public|g' /etc/apache2/sites-available/000-default.conf \
    && sed -i 's|/var/www/html|/app/public|g' /etc/apache2/apache2.conf \
    && echo '<Directory /app/public>\n    AllowOverride All\n    Require all granted\n</Directory>' >> /etc/apache2/apache2.conf

EXPOSE 80
