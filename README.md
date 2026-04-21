# PDFix

A lightweight, modern web application for merging multiple PDF files and converting them to the PDF/A long-term preservation standard.

## Features

- **PDF Merge**: upload multiple PDF files, reorder them via drag and drop, and combine them into a single document.
- **PDF/A Conversion**: convert PDFs to the PDF/A-1b archival standard, with an embedded sRGB ICC color profile and compliant XMP metadata. Can be applied during merge or to a single file.
- **In-Browser Preview**: instantly displays the page count and metadata of each uploaded file before any server-side processing, powered by pdf-lib running entirely in the browser.

## Architecture

The project follows a clean client/server separation. The frontend is a Vue.js single-page application that communicates with the PHP backend through a REST API. In development, Vite proxies API requests to the backend; in production, Nginx handles the proxying inside Docker.

```
PDFix/
├── client/                      Vue.js 3 frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Uploader.vue         Drag-and-drop + file picker
│   │   │   └── FileList.vue         Sortable list (VueDraggable)
│   │   ├── App.vue                  Root component and orchestration
│   │   ├── main.js                  Application entry point
│   │   └── style.css                Tailwind CSS imports
│   ├── tests/                       Vitest test suites
│   ├── Dockerfile                   Multi-stage build (Node -> Nginx)
│   ├── nginx.conf                   Reverse proxy to backend /api
│   ├── package.json
│   └── vite.config.js
├── server/                      PHP 7.4+ backend
│   ├── src/
│   │   ├── Merger.php               PDF merge logic (TCPDF + FPDI)
│   │   └── Converter.php            PDF/A conversion with ICC embedding
│   ├── public/
│   │   ├── index.php                API router and request handling
│   │   └── .htaccess                Apache URL rewriting
│   ├── tests/
│   │   ├── Unit/                    Isolated tests for Merger and Converter
│   │   ├── Integration/             End-to-end tests against a live server
│   │   └── fixtures/                Sample PDF files for testing
│   ├── Dockerfile                   PHP 7.4 + Apache + Composer
│   ├── composer.json
│   └── phpunit.xml
├── deploy/                         Build + install tooling (build.sh, composer.phar, vhost template)
├── docker-compose.yml               Two-service stack (client + server)
└── LICENSE                          GNU AGPLv3
```

### Frontend stack

| Library          | Purpose                                                    |
|------------------|------------------------------------------------------------|
| **Vue.js 3**     | UI framework, Composition API                              |
| **Vite**         | Dev server with hot module replacement and production build |
| **Tailwind CSS** | Utility-first styling                                      |
| **VueDraggable** | Drag-and-drop reordering of the file list                  |
| **Axios**        | HTTP client for multipart file uploads to the backend      |
| **pdf-lib**      | Client-side PDF parsing for page count preview             |

### Backend stack

| Library    | Purpose                                                                    |
|------------|----------------------------------------------------------------------------|
| **PHP 7.4+** | Server runtime                                                           |
| **TCPDF**  | PDF generation with native PDF/A support via `setPDFA(true)`               |
| **FPDI**   | Imports pages from existing PDF documents into a TCPDF instance            |
| **Composer** | Dependency management and PSR-4 autoloading                              |

### API endpoints

All endpoints accept and return JSON for errors. Successful PDF operations return the binary PDF directly as a download (`Content-Type: application/pdf`).

| Method | Endpoint        | Description                                                           |
|--------|-----------------|-----------------------------------------------------------------------|
| POST   | `/api/merge`    | Merge 2 or more PDF files. Pass `pdfa=1` in the form data to additionally convert the output to PDF/A. |
| POST   | `/api/convert`  | Convert exactly 1 PDF file to PDF/A-1b format.                        |
| GET    | `/api/health`   | Returns server status, PHP version, and loaded extensions.            |

**Validation**: the API checks the `.pdf` file extension and verifies the `%PDF-` magic bytes on every uploaded file before processing. Files that do not pass validation are rejected with a 422 response.

## Requirements

- **Node.js** >= 18
- **PHP** >= 7.4 with the `mbstring` and `gd` extensions enabled
- **Composer** >= 2
- **Docker** and **Docker Compose** (optional, for containerized deployment)

## Getting started

### Local development

Start the frontend and backend in two separate terminals:

```bash
# Terminal 1 -- Frontend
cd client
npm install
npm run dev
```

```bash
# Terminal 2 -- Backend
cd server
composer install
composer serve
```

The frontend will be available at `http://localhost:5173`. Vite is configured to proxy all `/api/*` requests to `http://localhost:8080`, so the two processes work together seamlessly.

### Docker Compose

To run the entire stack in containers:

```bash
docker compose up --build
```

This starts two services:

- **client** (Nginx on port 5173): serves the built Vue.js app and proxies `/api` to the backend.
- **server** (Apache + PHP on port 8080): handles API requests with a 50 MB upload limit and 256 MB memory ceiling.

## Testing

### Frontend -- Vitest

```bash
cd client
npm test
```

Runs 15 tests across 3 suites:

- **App.test.js**: verifies the root component renders correctly, shows the uploader, hides elements when no files are loaded, and displays the license footer.
- **Uploader.test.js**: tests the drag-and-drop area rendering, file input configuration, file selection events, disabled state styling, and drag enter/leave visual feedback.
- **FileList.test.js**: tests file count display, file name and size formatting, page count from preview data, remove button event emission, and drag handle presence.

### Backend -- PHPUnit

```bash
cd server
composer test
```

The test suite is split into two groups:

**Unit tests** (no server required):

```bash
cd server
vendor/bin/phpunit --testsuite Unit
```

- **MergerTest**: validates file addition, rejection of invalid paths, fluent interface, minimum file requirement, PDF output correctness, and PDF/A metadata presence.
- **ConverterTest**: validates PDF/A output correctness, XMP metadata embedding, rejection of invalid files, and output size increase due to ICC profile embedding.

**Integration tests** (require a running server):

```bash
# Start the server first
cd server && composer serve &

# Then run the integration suite
PHP_TEST_SERVER=http://localhost:8080 vendor/bin/phpunit --testsuite Integration
```

- **ApiTest**: tests the health endpoint, method enforcement (POST-only for merge/convert), file count validation, successful merge and conversion responses, and 404 handling.

Set the `PHP_TEST_SERVER` environment variable to override the default `http://localhost:8080` base URL.

## IntelliJ IDEA Ultimate

The project ships with 5 pre-configured Run Configurations under `.idea/runConfigurations/`:

| Configuration        | What it does                                         |
|----------------------|------------------------------------------------------|
| Vite Dev Server      | Runs `npm run dev` to start the frontend on port 5173 |
| PHP Built-in Server  | Starts the PHP built-in server on port 8080 with `server/public` as document root |
| Vitest               | Runs `npm test` to execute the frontend test suite    |
| PHPUnit              | Runs the backend test suite using `server/phpunit.xml` |
| Docker Compose       | Builds and starts the full containerized stack        |

To run the PHP tests from IntelliJ, configure a PHP interpreter (local or Docker) under **Settings > PHP** and point the PHPUnit configuration to `server/phpunit.xml`.

## PDF/A compliance

PDFix produces PDF/A-1b compliant documents by enabling TCPDF's built-in PDF/A mode, which is activated by passing `1` as the 7th argument to the TCPDF/FPDI constructor (`new Fpdi('P', 'mm', 'A4', true, 'UTF-8', false, 1)`). When this flag is set, TCPDF:

1. Fixes the PDF version and structure to match the PDF/A-1b specification.
2. Automatically embeds the bundled **sRGB IEC61966-2.1** ICC color profile as an `OutputIntent`, so colors are device-independent and reproducible (a core requirement of the archival standard).
3. Emits the XMP metadata declaring the `pdfaid` namespace and conformance level B (basic) of part 1.

No external ICC file is needed: the profile shipped inside the TCPDF library is used directly.

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPLv3).

If you deploy this application on a publicly accessible server, you are required to make the complete corresponding source code available to all users who interact with it over the network.

See the [LICENSE](LICENSE) file for the full license text.

### Dependency licenses

All dependencies use licenses that are compatible with AGPLv3:

| Library        | License | Compatible |
|----------------|---------|------------|
| Vue.js 3       | MIT     | Yes        |
| Vite           | MIT     | Yes        |
| TCPDF          | LGPL    | Yes        |
| FPDI           | MIT     | Yes        |
| Tailwind CSS   | MIT     | Yes        |
| VueDraggable   | MIT     | Yes        |
| pdf-lib        | MIT     | Yes        |
| Axios          | MIT     | Yes        |


# Copyright 
© Lorenzo De Marco (Lorenzo DM) - 2026