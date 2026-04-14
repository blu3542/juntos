"""TripAdvisor scraper — stub.

TripAdvisor aggressively blocks automated scraping (Cloudflare, CAPTCHA, JS
fingerprinting). A production implementation would require headless Chrome with
randomized user agents and CAPTCHA solving, which is out of scope for this
static one-time dataset.

TODO: implement with Selenium if needed:
  1. Launch headless Chrome via webdriver-manager
  2. Navigate to https://www.tripadvisor.com/Search?q={city}
  3. Scroll through restaurant/attraction listings
  4. For each listing page, extract review cards (.reviewSelector)
  5. Parse: location name, rating, review text, author, date
  6. Handle pagination (next page button)
  7. Return list of standard review dicts
"""


def scrape(city: str) -> list[dict]:
    raise NotImplementedError(
        "TripAdvisor scraper is not yet implemented. See TODO comments in this file."
    )
