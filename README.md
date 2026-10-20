# Customer Feedback and Review Platform

A full-stack web application where customers register, log in, and review products. Every review is analysed automatically by an AI sentiment model (Positive / Negative / Neutral), and an admin dashboard shows statistics.

**Team:** Shyam Sundar R (44111011), Sai Surendhar (44111002)
**Department:** CSE, Sathyabama Institute of Science and Technology
**Course:** Professional Training I

## Features
- User registration and login (passwords hashed with scrypt, signed session token)
- Product list with average rating and review count
- Star rating + written review (one review per user per product)
- **AI sentiment analysis** on every review comment
- Admin dashboard: total reviews, average rating, sentiment donut chart, rating distribution chart, delete reviews, add products

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express |
| Database | SQLite (Node built-in `node:sqlite`) |
| AI | `sentiment` library (lexicon-based NLP) |
| Security | scrypt password hashing, HMAC-signed tokens |

## Architecture
```
Browser (HTML/CSS/JS)  -->  Express REST API  -->  SQLite database
                                  |
                           Sentiment AI module
```

## How to Run
Requirements: Node.js v22 or later (LTS)

```
npm install
npm start
```
Open http://localhost:3000

Admin page: http://localhost:3000/admin.html (password: `admin123`)

## Project Structure
```
feedback-platform/
├── server.js        (API, database, authentication, AI)
├── package.json
└── public/
    ├── index.html   (customer interface)
    └── admin.html   (admin dashboard)
```

## API Endpoints
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/register | Create account |
| POST | /api/login | Login, returns token |
| GET | /api/products | Products with average rating |
| GET | /api/products/:id/reviews | Reviews of a product |
| POST | /api/reviews | Submit review (login required, AI sentiment added) |
| GET | /api/admin/reviews | All reviews (admin) |
| GET | /api/admin/stats | Statistics (admin) |
| DELETE | /api/admin/reviews/:id | Delete review (admin) |
| POST | /api/admin/products | Add product (admin) |

## Future Enhancements
- Spam / fake review detection
- AI-generated review summaries
