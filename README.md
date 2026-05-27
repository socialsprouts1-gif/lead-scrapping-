# Lead Scraper

A production-ready lead scraping web application built with Node.js, Express, Puppeteer, Cheerio, and MongoDB. Scrapes business leads from Google Maps, Yellow Pages, Yelp, and BBB, then presents them in a modern dashboard.

## Features

- Multi-source scraping: Google Maps (Puppeteer), Yellow Pages, Yelp, BBB (Axios + Cheerio)
- Real-time job progress tracking
- Deduplication before saving
- Lead management: view, update status/notes, delete
- Export to CSV, Excel, XLSX, or JSON
- Rate limiting, anti-detection headers, proxy rotation
- Winston logging (console + file)
- Modern responsive dashboard

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Chrome/Chromium (Puppeteer downloads it automatically)

## Installation

```bash
git clone <repo-url>
cd lead-scrapping-
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
node server.js
```

Open `http://localhost:3000` in your browser.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Description | Default |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/leads` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SCRAPE_DELAY_MIN` | Min delay between requests (ms) | `2000` |
| `SCRAPE_DELAY_MAX` | Max delay between requests (ms) | `8000` |
| `MAX_WORKERS` | Max concurrent scraping jobs | `3` |
| `REQUEST_TIMEOUT` | HTTP request timeout (ms) | `30000` |
| `HUNTER_API_KEY` | Hunter.io API key for email finding | (optional) |
| `PROXY_LIST` | Comma-separated proxy URLs | (optional) |
| `LOG_LEVEL` | Winston log level | `info` |

## Usage

### Dashboard

1. Go to `http://localhost:3000`
2. Enter a profession (e.g. "Plumber") and location (e.g. "New York, NY")
3. Select a source or "All Sources"
4. Click "Start Scraping"
5. Monitor progress in the progress bar
6. View leads in the Leads tab

### API

#### Start a Scraping Job

```
POST /api/scrape
Content-Type: application/json

{
  "profession": "Plumber",
  "location": "New York, NY",
  "source": "google-maps"  // or "yellow-pages", "yelp", "bbb", "all"
}

Response: { "jobId": "uuid", "message": "Scraping started" }
```

#### Get Job Status

```
GET /api/jobs/:jobId

Response: {
  "jobId": "...",
  "status": "running",
  "progress": 45,
  "totalFound": 12,
  "totalSaved": 10,
  "errors": []
}
```

#### List Recent Jobs

```
GET /api/jobs
Response: { "jobs": [...], "total": 20 }
```

#### List Leads

```
GET /api/leads?profession=&location=&source=&status=&search=&page=1&limit=50&sort=scrapedDate&order=desc

Response: { "leads": [...], "total": 200, "page": 1, "limit": 50, "pages": 4 }
```

#### Get Single Lead

```
GET /api/leads/:id
```

#### Update Lead

```
PUT /api/leads/:id
Content-Type: application/json

{
  "status": "contacted",
  "notes": "Called on Monday, interested",
  "contacted": true
}
```

#### Delete Lead

```
DELETE /api/leads/:id
```

#### Export Leads

```
POST /api/leads/export
Content-Type: application/json

{
  "format": "csv",   // "csv", "excel", or "json"
  "filters": {
    "status": "new",
    "source": "google-maps"
  }
}
```

## Proxy Configuration

Add proxies to avoid rate limiting from scraping sites:

```
PROXY_LIST=http://user:pass@proxy1.example.com:8080,http://user:pass@proxy2.example.com:8080
```

Proxies are rotated in round-robin per request.

## Troubleshooting

**MongoDB connection fails:**
- Check your `MONGO_URI` in `.env`
- For Atlas, whitelist your IP address
- The server will start without MongoDB but most features won't work

**Puppeteer fails to launch:**
- On Linux servers, ensure: `apt-get install -y chromium-browser`
- Or set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`

**Scraping returns no results:**
- Sites may be blocking requests — configure proxies
- Yellow Pages, Yelp, and BBB will fall back to sample data when blocked
- Try different user agents or increase delay

**Rate limit errors (429):**
- Increase `SCRAPE_DELAY_MIN` and `SCRAPE_DELAY_MAX`
- Add proxy rotation

## Legal & Ethical Notes

- Always check a website's Terms of Service before scraping
- Respect `robots.txt` and rate limits
- Use scraped data in compliance with applicable data protection laws (GDPR, CCPA)
- This tool is intended for legitimate business development purposes only
- Do not use to collect personal data without consent
