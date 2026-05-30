cd ~/corn-gdd-tracker && git add -A && git commit -m "Warn when weather station is >20km from farm

- Compute Haversine distance in farms.php GET/POST responses
- Show amber warning banner in WeatherStationCard when >20km
- Pass stationDistanceKm through App → Dashboard → WeatherStationCard

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" && git push origin main && npx vercel --prod --yes