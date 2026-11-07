# Attribution and source context

Ground Station Zero is an original educational kit by **Jacob Zepeda / BuildingWithJacob**. Its browser interface, synthetic mission stories and records, workbook text, flow diagrams, exercises, and launch copy are original kit material. They are covered by `LICENSE.txt`.

The mission datasets are invented, fixed-time records for a small rule-based investigation exercise. They do not represent a real satellite, ground station, orbit, radio link, security incident, person, or organization. Values and events were selected to make reasoning reproducible, without claims of orbital, scientific, operational, or RF realism.

## NASA EONET

- NASA Earth Observatory Natural Event Tracker (EONET): <https://eonet.gsfc.nasa.gov/>
- EONET version 3 documentation: <https://eonet.gsfc.nasa.gov/docs/v3>
- EONET version 3 events API: <https://eonet.gsfc.nasa.gov/api/v3/events>

EONET is a public source of natural-event metadata. The optional provenance tool can fetch the fixed official endpoint named in its output or process local input. A live output records its own source URL and retrieval timestamp; availability and content can change. Consult the documentation and individual event source links when interpreting real EONET records.

`docs/eonet-synthetic.json` is a clearly labeled, original **synthetic EONET-shaped fixture** for offline practice. It was not downloaded from NASA and is not a NASA observation. The provenance exercise teaches source labeling, timestamps, and hashing; it does not turn natural-event data into spacecraft telemetry or cybersecurity evidence.

NASA did not create, sponsor, approve, review, or endorse Ground Station Zero. No NASA logo or endorsement mark is included. An API source link is attribution and provenance context, not permission to imply affiliation.

## Technical concepts and dependencies

The kit teaches common evidence-handling ideas, station-scoped sequence checks, timestamp comparisons, explicit thresholds, allowlists, and HMAC integrity demonstrations. It uses browser Web Crypto and standard JavaScript, Node.js, and Python facilities. There are no third-party runtime packages, remote fonts, analytics, or copied satellite-lab source files in the core app.

The publicly disclosed HMAC key `GSZ-TRAINING-KEY-DO-NOT-USE-IN-PRODUCTION` is an educational fixture. A valid HMAC made with this disclosed shared key is not evidence of a trusted sender. The injection-marker exercise is a simple string heuristic; no third-party AI system is tested or certified.

Product inspiration from the general idea of a satellite cybersecurity learning roadmap does not confer affiliation or ownership of third-party material. The kit's exercises and explanations stand on the included original synthetic evidence.
