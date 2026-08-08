# Route Duration Tracker

A person chooses point 1 and point 2 on Yandex Maps (or Google Maps—it doesn't matter), and the application generates a link for this route.

Every hour, the application checks the Yandex Maps API for the duration of the route from point 1 to point 2 and stores the result in a PostgreSQL database hosted in Yandex Cloud. Route-duration data accumulates over time.

A person can visit their route's page and see a timeline of its duration.

If the person has not visited the page for at least 60 days, the route and its accumulated data must be removed from the database.
