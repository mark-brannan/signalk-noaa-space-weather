# Space weather over HF, when there is no IP

Design research for
[#86](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/86),
part of the `ham-radio` initiative
([#87](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/87)).
Compiled 2026-08-29. No code follows from this file directly; its output is the
follow-up issues at the end.

Offshore, the plugin's whole data path — HTTPS to `services.swpc.noaa.gov` — is
gone. The boats that most need space weather are on HF precisely because there
is no IP, and they already run a store-and-forward email channel: Winlink
(amateur) or Sailmail (marine). This file answers which products can reach a
boat over that channel, what they cost against the channel's real limits, how
the plugin should ingest them, and what that is allowed to add to the config
form.

**Verification status is marked throughout.** Anything sourced from vendor
documentation is cited; anything measured here carries the date and the method;
anything that could not be established from outside the system is called
**unverified** rather than described plausibly. Most of what is still open could
only be settled by an operator with a radio actually sending or hearing a
message, and all of it is listed under
[What is still unverified](#what-is-still-unverified).

## The constraint that shapes everything: the plugin never transmits

Saildocs' [terms](https://saildocs.com/terms), read 2026-08-29, condition 3:

> Requests from any automated process via any means requires an agreement. An
> "automated process" in this case means anything other than an individual
> person manually initiating an individual request which is sent directly to
> Saildocs.

That is decisive, and it is the single most useful thing this research turned
up. The obvious design — the plugin composes a `send wwv.txt` message, drops it
in Pat's outbox, and the operator's next session collects the reply — is a
licence violation on the first tick. Condition 4 closes the adjacent door
("Redirection of any request from any other email address, or initiated from any
website or device app interaction requires an agreement").

So the split is fixed:

- **The operator owns the request.** They type the `sub` lines once, by hand,
  from their own mail client. That is a person manually initiating a request,
  which is what the terms permit, and a scheduled delivery entered that way is
  Saildocs' own advertised feature rather than an automation on top of it.
- **The plugin owns only the receive side.** It reads what arrived. It never
  composes, never sends, never triggers a radio session.

This is also the right answer for reasons that have nothing to do with Saildocs.
An HF session costs the operator power, time and an antenna they may be using
for something else; a navigation plugin does not get to key a transmitter. And
Sailmail's [terms](https://sailmail.com/cost-and-application-process/terms-and-conditions/)
cap use at "a running average of 90 minutes per week", which is the operator's
budget to spend, not the plugin's.

## The carriers, and who is licensed for what

Three names get used interchangeably in cruising forums and they sit on three
different regulatory footings. The plugin is indifferent to all of it — the
receive side is the same directory of files either way — but it is the first
question an operator asks, and the answer changes what they are allowed to send.

**Saildocs holds no licence and needs none.** It never transmits. It is a mail
robot on the internet, run by Sirius Cybernetics LLC, and it does not know or
care that the far end of the conversation is a radio. Its `sub` is a scheduled
_delivery_ — a cron entry that mails a document for `days=` days — not a paid
subscription. NOAA's [PSS](https://pss.swpc.noaa.gov) is the same shape: a free
mailing list, pushed by an ordinary mail server.

**Sailmail is licensed maritime spectrum, operated by a non-profit for
non-commercial vessels.** The SailMail Association holds FCC **Part 80 private
coast station** licences — WQAB964 San Diego, KUZ533 Honolulu, KZN508 Rock Hill,
WHV382 Friday Harbor, WPTG385 Corpus Christi, plus stations outside the US
([their licence page](https://sailmail.com/fcc-licenses/)). The eligibility that
allows it is
[§80.501(a)(10)](https://www.govregs.com/regulations/expand/title47_chapterI-i4_part80_subpartK_section80.501):
"A nonprofit organization providing noncommercial communications to vessels
other than commercial transport vessels." Membership is limited to
non-commercial vessels under 1600 tons; each member vessel needs its own ship
station licence and must carry copies of Sailmail's FCC licences aboard. Part 80
permits the members' own business and operational traffic, which is the practical
difference from Winlink — and the reason it costs $275 a year.

**Winlink is amateur spectrum under Part 97.** Winlink is a volunteer project of
the Amateur Radio Safety Foundation, a non-profit; every gateway and every boat
is an ordinary licensed amateur station, and use is free with a donation
requested. Two rules follow and both matter here:
[§97.113(a)(3)](https://www.law.cornell.edu/cfr/text/47/97.113) forbids traffic
in which the operator has a pecuniary interest, so boat business goes over
Sailmail and not over Winlink; and §97.113(a)(4) forbids "messages encoded for
the purpose of obscuring their meaning", which is why Winlink is plaintext —
with consequences taken up under
[the ambitious form](#the-ambitious-form-a-ham-ground-station). Winlink also runs
MARS and SHARES networks on federal spectrum for military and government users;
those are separately authorised and not a cruiser's to use.

**Neither is a commercial band in the common-carrier sense**, and the licence is
the operator's problem, not the plugin's. Routes A and B below work identically
over either.

## Transmit side: three routes, two of which need nothing built

### Route A — Saildocs, over either Winlink or Sailmail

Saildocs is an email robot: mail `query@saildocs.com`, get plain text back. It
is reachable from any email address, including a Winlink or Sailmail one, and
sailors already use it for GRIBs. From [its own documentation](https://saildocs.com/info)
(revised 2025-11-01, read 2026-08-29):

> Saildocs can also fetch documents from the web and convert them to plain
> text. Send a message to query@saildocs.com, with "Send" followed by the URL
> (web address) […]

and

> Any request can be turned into a scheduled delivery by changing the "send"
> command to "sub" (or "subscribe").

The scheduled-delivery grammar, quoted from the same document: `time=` sets the
UTC start, `interval=` the hours between deliveries, `days=` the length of the
subscription (default 14; `days=0` is indefinite, per
[gribinfo](https://saildocs.com/gribinfo)). `cancel` ends one. A line of five or
more dashes terminates the request, and Saildocs may not respond at all if a
mail footer follows the commands.

So the operator's whole setup is one message:

```
To: query@saildocs.com
Subject: anything

sub https://services.swpc.noaa.gov/text/wwv.txt time=00:00 interval=6 days=0
sub https://services.swpc.noaa.gov/text/3-day-forecast.txt time=01:00 days=0
sub https://services.swpc.noaa.gov/text/advisory-outlook.txt time=04:00 interval=24 days=0
-----
```

**Saildocs publishes no per-message size limit.** Neither `/info` nor `/terms`
states one; `/gribinfo` states the limits of the _carriers_ instead, which is
the honest place for them (quoted under [the size budget](#the-size-budget)).
The known limitations it does state are that long URLs need properly MIME-encoded
messages and "may not work with all email systems", and that web pages convert
to text with varying success — "the fancier the page, the worse the results".
SWPC's `/text/*` products are the least fancy pages on the internet, which is
what makes this route work at all. What Saildocs does to a `.json` URL is
**unverified**.

### Route B — SWPC's own email subscriptions, straight to the radio address

SWPC runs a subscription service at <https://pss.swpc.noaa.gov>, linked from
[Subscription Services](https://www.spaceweather.gov/content/subscription-services).
It emails alerts, warnings, watches and summaries within moments of issue, to
whatever address is registered — including a Winlink or Sailmail one. Nothing is
built and nothing is relayed.

The important verification: **every alert code this plugin has ever parsed is
offered as a subscription.** Extracting `Space Weather Message Code:` from all
498 messages in `examples/alerts.*.json` gives 29 distinct codes; extracting the
product codes from the subscription page's tables gives 38. All 29 are in the 38. (NOAA's page typos the K-index-4 alert as `ATLK04`; the payload spells it
`ALTK04`.) That means the subscription emails carry the same message code
vocabulary `parse.ts` already understands.

What is **unverified** is the email body itself — whether it is exactly the text
that `alerts.json` carries in its `message` field, or that text inside some
wrapper. The evidence that it is the same text is strong (the `message` field is
the canonical product, and the codes match) but nobody here has received one.
That single observation decides whether `parseAlert` runs unchanged; see the
follow-ups.

### Route C — a community relay or a compact digest

A shore-side service that composes a machine-formatted digest and mails it on a
schedule. **Don't build it.** Routes A and B already deliver everything the
plugin can use, in formats it already parses, at a cost the channel does not
notice (below). A digest would buy perhaps 60% off an already-negligible bill,
in exchange for a service to run, a format to version, and — under Saildocs'
condition 5 — a redistribution question. The one thing it would buy that A and B
cannot is a payload small enough for a _broadcast_ channel, which is
[a different argument](#the-ambitious-form-a-ham-ground-station) and still not a
reason to build a mail relay.

## Which products over which route

Sizes measured 2026-08-29 by fetching each URL and taking the raw body length —
plain text bytes, because that is what goes into an email body. The gzip column
is `zlib.gzipSync` of the same bytes, quoted only as a floor on what the radio
link's own compression can achieve. The four rows that are also plugin endpoints
agree with the payload table in
[noaa-products.md](noaa-products.md#payload-size) at its precision.

| Product                       | Endpoint                                  | Plain            | gzip    | Route                 | Plugin product      |
| ----------------------------- | ----------------------------------------- | ---------------- | ------- | --------------------- | ------------------- |
| Geophysical Alert (WWV)       | `/text/wwv.txt`                           | 540 B            | 348 B   | A, `sub` 4–8×/day     | `aIndex`            |
| 3-day forecast                | `/text/3-day-forecast.txt`                | 1,907 B          | 782 B   | A, `sub` daily        | — (not an endpoint) |
| Advisory Outlook              | `/text/advisory-outlook.txt`              | 1,538 B          | 768 B   | A, `sub` weekly       | `advisory`          |
| 27-day outlook                | `/text/27-day-outlook.txt`                | 1,606 B          | 443 B   | A, `sub` weekly       | `outlook27`         |
| Daily solar indices (DSD)     | `/text/daily-solar-indices.txt`           | 2,919 B          | 831 B   | A, `sub` daily        | `sunspot`           |
| Current space weather indices | `/text/current-space-weather-indices.txt` | 1,942 B          | 651 B   | A, on demand          | —                   |
| Solar region summary          | `/text/solar-regions.txt`                 | 867 B            | 457 B   | A, on demand          | —                   |
| Forecast discussion           | `/text/discussion.txt`                    | 2,706 B          | 1,203 B | A, on demand          | —                   |
| Weekly highlights             | `/text/weekly.txt`                        | 3,249 B          | 1,400 B | A, on demand          | —                   |
| SGAS                          | `/text/sgas.txt`                          | 1,059 B          | 648 B   | A, on demand          | —                   |
| D-RAP global grid             | `/text/drap_global_frequencies.txt`       | 42,499 B         | 2,192 B | A, **on demand only** | `drap`              |
| Alerts / warnings / watches   | —                                         | 165–1,003 B each | —       | B, subscription       | `alerts`            |

Three readings of that table:

**`wwv.txt` is the anchor.** 540 bytes carries SFI, the estimated planetary A,
the current K, and a plain-English 24-hour summary and forecast — the four
things an HF operator reads conditions by. It reissues every three hours
(NIST, below), so `interval=6` gives four a day for 2.2 KB and `interval=3`
gives eight for 4.3 KB.

**D-RAP is the surprise, and it is conditional.** 42.5 KB of plain text is by
far the largest thing here, but it is also 90×90 numbers of pure ASCII: gzip
takes it to 2.2 KB, and PACTOR's own compression should do something similar.
It is the one product that answers "can I use HF _right now_, on this band, at
this latitude", which is exactly the question a boat with no IP is asking. But
it is a nowcast on a minutes cadence, and a copy that arrived at the last radio
session is a historical document. **Subscribe to it only if the operator
genuinely fetches on demand before a schedule**; never `sub` it on an interval.
Whether Saildocs returns all 42.5 KB of it intact is **unverified**.

**The alerts route is Route B, not Route A.** `/products/alerts.json` is a
rolling 30-day archive — 50 KB decoded, and mostly messages that expired weeks
ago (see
[noaa-products.md](noaa-products.md#productsalertsjson-is-an-archive-not-current-conditions)).
Pulling it over HF would buy 50 KB to learn about four events. The subscription
pushes each message once, when it is issued, at a median 612 bytes.

Measured from this repo's own fixtures (three 30-day archives, 498 messages):

| Fixture window    | Messages     | Rate     | All codes  | Severe subset |
| ----------------- | ------------ | -------- | ---------- | ------------- |
| ending 2025-04-11 | 180 / 29.8 d | 6.0 /day | 3.6 KB/day | 0.66 KB/day   |
| ending 2025-04-17 | 200 / 29.7 d | 6.7 /day | 4.2 KB/day | 1.08 KB/day   |
| ending 2026-08-01 | 118 / 29.5 d | 4.0 /day | 2.0 KB/day | 0.64 KB/day   |

"Severe subset" is the K≥6, proton, and M5/X-class codes — roughly what a boat
with the default `alarmLevel` would actually be interrupted by. Subscribing to
that subset instead of everything is a 3–4× saving and loses nothing the
notification thresholds would have raised. **The subscription set should mirror
the boat's thresholds**, and that is a recipe for the operator, not a setting.

## The size budget

The carriers' stated limits, and where they come from:

- **Winlink: 120 KB per message, total, including attachments.** Saildocs'
  [gribinfo](https://saildocs.com/gribinfo) states the client side ("Winlink
  allows attachments after the user has set an attachment limit (120KB max)");
  community documentation states the CMS enforces 120,000 bytes on the
  _compressed_ message. No Winlink connect-time quota was found in its published
  documentation (**unverified** — absence of a stated limit is not a stated
  absence), but the system expects amateur-service traffic (see [the legal boundary](#the-ambitious-form-a-ham-ground-station)).
- **Sailmail: 30 KB per GRIB attachment, 10 KB on PACTOR-2** — same source —
  and, from Sailmail's [terms](https://sailmail.com/cost-and-application-process/terms-and-conditions/),
  "a running average of 90 minutes per week, calculated over the previous week",
  at $275 per vessel per year. **The 90 minutes is the real constraint**, not
  bytes.
- **Throughput.** PACTOR-3 is 2,722 bps uncompressed and up to 5,200 bps
  effective on plain text with its built-in Markov compression
  ([SCS](https://www.p4dragon.com/download/PACTOR-3%20Protocol.pdf)); PACTOR-4
  up to 10,500 bps compressed, 5,500 gross; VARA HF around 7,000 bps in a
  2.3 kHz channel. Every one of those is a clear-channel ceiling from the
  vendor. Real offshore throughput is a fraction of it and depends on distance,
  time of day and the ionosphere the plugin is trying to describe.

Now the plan. A weekly subscription of `wwv.txt` every 6 hours, the 3-day
forecast daily, the advisory outlook weekly, and the severe-subset alerts:

| Item                           | Messages/week | Plain bytes/week |
| ------------------------------ | ------------- | ---------------- |
| `wwv.txt` ×4/day               | 28            | 15,120           |
| `3-day-forecast.txt` ×1/day    | 7             | 13,349           |
| `advisory-outlook.txt` ×1/week | 1             | 1,538            |
| Alerts, severe subset          | ~7            | ~5,000           |
| **Total**                      | **~43**       | **~35 KB**       |

Saildocs adds a header to each reply, whose size is **unverified** — call it a
few hundred bytes, so perhaps 10 KB across 43 messages, giving ~45 KB a week of
plain text. Against PACTOR-3's 5,200 bps ceiling that is 70 seconds; at a
pessimistic fifth of the ceiling, about 6 minutes. **Against Sailmail's 90
minutes a week, the entire space-weather plan costs single-digit minutes.** Even
adding an on-demand D-RAP grid before a passage — 42.5 KB plain, likely 3–6 KB
after the link's compression — adds seconds, not minutes.

The budget is therefore not the interesting constraint, and the design should
not pretend it is. **The interesting constraint is latency**: HF email is polled
by the operator, not pushed. A G4 alert issued at 0300 arrives when the operator
next connects, which might be at 1400. That is a briefing channel with
opportunistic alerting. The plugin must publish it with the observation time it
actually carries, and never let it look live.

## What is already on the air, without email

The prompt asked whether space weather is already broadcast over HF in some
form, and whether that is voice or something a modem could take. Both, and the
distinction matters.

**WWV and WWVH — voice, and it is the same bulletin.** From
[NIST](https://tf.nist.gov/stations/iform.html): "Geophysical alerts are
broadcast from WWV at 18 minutes after the hour and from WWVH at 45 minutes
after the hour", "less than 45 s in length and […] updated every 3 hours
(typically at 0000, 0300, 0600, 0900, 1200, 1500, 1800, and 2100 UTC)", supplied
by NOAA. It is `wwv.txt` read aloud — SFI, A, K, then observed and forecast. Any
receiver on 2.5/5/10/15/20/25 MHz gets it with no equipment at all.

It is **natural-language audio**, and machine ingest would mean speech
recognition on a Pi against a fading HF signal, to recover 540 bytes that
Saildocs delivers exactly. Not a route. It is, however, the reason the plugin's
`aIndex` product exists and the reason its values will read as familiar: the
operator has been copying these numbers by ear for years.

NIST's separate [digital time code](https://www.nist.gov/pml/time-and-frequency-division/time-distribution/radio-station-wwv/wwv-and-wwvh-digital-time-code)
— the 100 Hz BCD subcarrier — carries minute, hour and day of year. **No space
weather rides on it.** There is no digital WWV channel to decode.

**W1AW — digital, and decodable today.** ARRL's station transmits its bulletin
series in 45.45-baud Baudot, PSK31 and MFSK16 on 3.5975, 7.095, 14.095,
18.1025, 21.095, 28.095, 50.350 and 147.555 MHz
([W1AW operating schedule](http://www.arrl.org/w1aw-operating-schedule)), at
2200 and 0100 UTC daily, on a rotating daily mode order
([digital transmissions](http://www.arrl.org/digital-transmissions)). Among the
series is the weekly **propagation bulletin, ARLP**, by Tad Cook K7RA: weekly
averages of sunspot number, solar flux and the A and K indices, plus narrative.
One archived example measures ~4.2 KB of text.

This is the closest thing that exists to a free, digital, over-the-air space
weather feed. It is also weekly, prose-heavy, US-centric in its propagation
commentary, and needs the boat to be listening at 2200 UTC on a band that is
open. As a plugin data source it is worse than a 540-byte email in every
dimension except cost. Worth knowing about; not worth building for.

**Marine radiofax and NAVTEX — no.** A keyword scan of the Ocean Prediction
Center's [Atlantic radiofax schedule](https://ocean.weather.gov/shtml/atlsch.php)
on 2026-08-29 found no space-weather, solar, ionospheric or propagation product;
the broadcast is surface analyses, wind/wave and satellite imagery. The
authoritative list is the _Worldwide Marine Radiofacsimile Broadcast Schedules_
PDF, which was not scanned — so call this **partly verified**. NAVTEX carries
navigational warnings and coastal forecasts, and was not examined.

**The modem question.** "Serial or NMEA 0183 from an ICOM" does not get you
data, and it is worth being precise about why, because the three cables look
similar:

- **NMEA 0183 into an IC-M802/M803 is position input for DSC.** The radio takes
  GPS position and UTC so a distress call carries a fix. It is an input, it
  carries no received data outward, and it has nothing to do with email.
- **CI-V (and the M802's RS-232 accessory port) is radio _control_** —
  frequency, mode, PTT. A modem uses it to QSY; it never carries payload.
- **The payload is audio.** Winlink, Sailmail, radiofax, RTTY, PSK31, MFSK16
  and JS8 all ride the SSB audio path. That means either a hardware modem (an
  SCS PACTOR unit, which is what most Sailmail installations use and what the
  $1,000-and-up figure refers to) or a soundcard plus software (VARA HF,
  fldigi, JS8Call). Modern amateur transceivers — IC-7300, IC-705 and their
  peers — present a USB audio codec _and_ CI-V over one USB cable, which is why
  a soundcard-modem setup on those rigs looks like "just plug it in": it is
  still audio, just already digitised.

So there is no "read space weather off the radio's serial port" path. Either the
boat runs an email client over a modem (Routes A and B, which is the design
below), or somebody decodes an over-the-air digital broadcast with a soundcard.

## The ambitious form: a ham ground station

The prompt's most ambitious option: work with amateurs to broadcast a concise
payload from a ground station that any cruiser with a modem could pick up. It is
technically easy and legally narrower than it first looks.

**47 CFR §97.111(b)(6)** permits an amateur station to transmit one-way
"[t]ransmissions necessary to disseminate information bulletins", and
[§97.3(a)](https://www.law.cornell.edu/cfr/text/47/97.3) defines an information
bulletin as "[a] message directed only to amateur operators consisting solely of
subject matter of direct interest to the amateur service", against "Broadcasting
… transmissions intended for reception by the general public". W1AW's ARLP
bulletins are the worked example.

The line that follows is sharp, and it is the finding:

- **A propagation digest addressed to amateur operators is squarely lawful.**
  Ionospheric conditions are of direct interest to the amateur service; this is
  what W1AW already does.
- **The same digest advertised as a service for cruising sailors is not.** The
  moment it is directed at the boating public rather than at licensed amateurs,
  it is broadcasting, and [§97.113(b)](https://www.law.cornell.edu/cfr/text/47/97.113) forbids it: "An amateur station shall not engage in any form of broadcasting, nor may an amateur station transmit one-way communications except as specifically provided in these rules". A ham-band digest cannot be
  the cruiser-facing product; at most, cruisers who happen to be licensed hear
  the bulletin as amateurs.

### One transmission, many consumers: Winlink is in clear, and receivers are free

The interesting consequence of §97.113(a)(4)'s ban on obscuring meaning is that
a Winlink session over HF is readable by anyone in range. That is not a
theoretical property. SCS, PACTOR's own developer, publishes
[PMON](https://winlink.org/content/pmon_independent_pactorwinlink_monitor_raspberry_pi):
"over-the-air monitoring of PACTOR 1/2/3 transmissions for meaning", on "a
Raspberry Pi 3 Model B+ (minimum) computer and an inexpensive USB sound device",
and "an SCS Pactor modem is not needed". It "automatically decompresses
B2F/LZHUF compressed messages on the fly".

So the receive side of a shared bulletin costs a listener nothing at all: no
Winlink account, no Sailmail membership, no $1,000 modem, no per-boat
subscription — a receiver and the Pi the plugin is already running on. And
divulging what is heard is lawful:
[47 USC §605(a)](https://www.law.cornell.edu/uscode/text/47/605) exempts "any
radio communication … transmitted by an amateur radio station operator" from its
no-divulging rule. **That exemption covers amateur only. It does not cover
Sailmail**, which is Part 80 maritime traffic, so the same monitoring over
Sailmail is a legal problem rather than a design option.

Which reframes the ambitious option, and improves it. The naive version — one
person subscribes and everyone else quietly copies their inbound mail — fails on
three counts: the session happens once, on one gateway's frequency, at a time
nobody else knows and only within that one path's footprint; VARA is
closed-source and no third-party monitor for it was found (**unverified**, but
do not assume one exists); and if the _purpose_ of the transmission is that
others copy it, it is an information bulletin wearing a disguise.

There is no reason to disguise it. §97.111(b)(6) makes the bulletin lawful
outright, and doing it openly fixes the timing problem in the same move: an
announced frequency and schedule, transmitted one-way in PACTOR's FEC/unproto
broadcast mode (documented for PACTOR-1 and PACTOR-2; whether PACTOR-3 offers
one is **unverified**), reaches everyone who chose to listen instead of whoever
happened to be. PACTOR also removes the throughput ceiling that makes JS8 look
marginal here: JS8Call has the better addressing — `@ALLCALL`, callgroups, and a
group inbox that holds messages for stations that were not listening — but at a
vendor-stated ~16 WPM, roughly 1.3 characters a second, a 540-byte `wwv.txt` is
about seven minutes on the air and a 4 KB ARLP is nearly an hour. Over PACTOR
the same `wwv.txt` is seconds, and every listener decodes it with free software.

**Recommendation: still don't build it as part of this feature, but it is now
worth a conversation rather than a footnote.** It needs an amateur partner
willing to run a scheduled station, a Part 97 read on the bulletin's addressing,
and someone to measure whether a one-way PACTOR bulletin is actually receivable
at sea. None of that is plugin work. What matters here is that the plugin does
not have to change to benefit: the receive side designed below is
transport-agnostic, and a PMON decode written to a watched directory is the same
ingest as an email written to a watched directory.

## Receive side: a second transport, not a second parser

This is the part that is actually plugin work, and the architecture already has
the seam for it.

`src/noaa/client.ts` is, by design, "the only outbound I/O in the plugin", and
every product's `refresh(ctx)` reaches the network only through `ctx.client`:

```ts
export interface Client {
  json(endpoint: Endpoint, productName: string): Promise<any>
  text(endpoint: Endpoint, productName: string): Promise<string>
  withTrigger(trigger: Trigger): Client
  readonly meter: Meter
}
```

**So HF ingest is a second `Client`.** One that answers `text(endpoint)` from a
document that arrived by radio instead of from HTTPS. Run a product's existing
`refresh` against it and every downstream behaviour is identical by construction
— the same parse, the same paths, the same zone metadata, the same
`methodForState`, the same webapp. `parse.ts` is not touched. `publisher.ts` is
not touched. No product is touched. The issue's framing ("feed the normal
product cache") needs one correction: there is no general product cache — only
aurora, D-RAP and the advisory outlook cache anything, and the rest publish
deltas directly. Substituting the client reaches all of them anyway.

### Where the documents come from

**Pat**, verified from source on 2026-08-29:

- Mailbox root is `DataDir()/mailbox`, i.e. `$XDG_DATA_HOME/pat/mailbox`
  (`~/.local/share/pat/mailbox` by default), migrated from the legacy
  `~/.wl2k/mailbox`
  ([`internal/directories`](https://github.com/la5nta/pat/blob/master/internal/directories/directories.go)).
- Under it, one directory per callsign:
  `mailbox/<MYCALL>/{in,out,sent,archive}` — the handler is constructed as
  `mailbox.NewDirHandler(filepath.Join(MailboxPath, MyCall), …)` in
  [`app/app.go`](https://github.com/la5nta/pat/blob/master/app/app.go).
- The four names and the file extension are constants in
  [`wl2k-go/mailbox/syncdir.go`](https://github.com/la5nta/wl2k-go/blob/master/mailbox/syncdir.go):
  `DIR_INBOX = "/in/"`, `DIR_OUTBOX`, `DIR_SENT`, `DIR_ARCHIVE`, `Ext = ".b2f"`.
- A `.b2f` file is the FBB/B2 message: `Mid`, `To`, `Date`, `Type`, `From`,
  `Cc`, `Subject`, `Mbo`, `Body` (a byte count), `File` (count and name)
  headers, then the body
  ([`fbb/header.go`](https://github.com/la5nta/wl2k-go/blob/master/fbb/header.go)).
  `Date` is `YYYY/MM/DD HH:MM` UTC. The body charset is ISO-8859-1 in practice.

Pat also runs an HTTP JSON API — `GET /api/mailbox/{in,out,sent,archive}` and
`/api/mailbox/{box}/{mid}`, from
[`api/api.go`](https://github.com/la5nta/pat/blob/master/api/api.go) — returning
`MID`, `Date`, `From`, `To`, `Subject`, `Body`, `Files`. Its default listen
address is `localhost:8080` and **there is no authentication option in Pat's
config**, which is a point for the directory watch rather than the API: reading
files needs no network surface at all, and works whether or not `pat http` is
running.

**Recommendation: watch a directory, and only a directory.** It covers Pat
(point at `mailbox/<MYCALL>/in`), covers Airmail if its message store is a
directory of files (**unverified** — nobody here has an Airmail install), covers
Winlink Express the same way, and covers a JS8 or fldigi decode, and a
`getmail`/`fetchmail` drop from an onboard IMAP server, for free. IMAP and the
Pat API are both strictly more configuration for strictly less coverage. Build
them if an operator asks, not before.

### Recognising a document

SWPC text products self-identify in their first line, which is what makes the
watcher cheap and unambiguous:

```
:Product: Geophysical Alert Message wwv.txt
:Issued: 2026 Aug 29 0305 UTC
```

`:Product:` names the file; that is the match key, and it maps onto exactly one
`Endpoint` in `src/endpoints.ts`. Two exceptions to handle: `daily-solar-indices.txt`
stamps `:Issued: 0825 UT 28 Aug 2026` (a different date order from everything
else), and the D-RAP grid uses `# Product: …` and `# Product Valid At :` instead
of the colon-keyword form. Anything that matches nothing is ignored, silently
and permanently — a boat's inbox is full of mail that is none of the plugin's
business, and reading it is not the plugin's business either.

**The plugin reads; it never writes, moves, deletes or marks-read anything in
the mailbox.** It is somebody's correspondence and somebody else's client's
state. Idempotency comes from the ordering rule below, not from consuming files.

### How received-over-HF loses to a fresher direct fetch, and the reverse

The rule is one high-water mark per endpoint, on the _observation_ time, shared
by both transports:

1. `parse.ts` already exports `parseIssueDate`, which reads the `:Issued:` line.
   The D-RAP variant needs a sibling for `Product Valid At`.
2. A small ledger — one JSON document through the existing `CacheStore` and
   `entryCache` helpers, no new storage primitive — records, per endpoint
   sub-path, the newest issue time that has been published.
3. **Both** transports consult and update it. The HTTPS client stamps it when a
   text fetch succeeds; the mailbox client refuses to serve a document whose
   issue time is not strictly newer than the mark.

That gives the required property symmetrically and without a rule about which
transport is "better": a Saildocs copy of the 0300Z bulletin that arrives at
1400, after the boat regained IP and fetched the 1200Z one, is simply older and
does nothing. A boat offshore for a week publishes each bulletin as it arrives.
A boat that regains IP mid-passage takes the fresher HTTPS copy the moment it
lands.

It also composes with what products already do. `aIndex` compares against the
published value _and_ day before emitting a delta; `advisory` dedupes against
its cache's `issued`. The ledger is a cheaper gate in front of them, not a
replacement.

Two honest consequences to state in the UI rather than hide:

- **Deltas carry the bulletin's own timestamp, not the receive time.** Signal K
  `timeout` metadata then does the right thing on its own: `aIndex` already
  declares 54 hours, so a bulletin that spent three days in a mailbox publishes
  and immediately reads as stale, which is the truth.
- **Alerts over HF are a sparse set, not the archive.** `alerts` derives the
  in-force set from a 30-day archive and stands messages down when they are
  withdrawn; a boat receiving individual subscription emails sees only what
  arrived. What makes that safe is the `Valid Until` line each message carries
  and the existing age gating — a message stands until its own validity passes
  or a `CANCEL` arrives. That should be confirmed against
  `currentAlertNotifications` during implementation rather than assumed here.

For alerts specifically, the adapter is tiny: `parseAlert` takes
`{ message, issue_datetime }`, the email body _is_ `message`, and
`issue_datetime` is reconstructed from the body's own `Issue Time:` line into
the `YYYY-MM-DD HH:MM:SS.mmm` shape `new Date(… + 'Z')` accepts. Assuming the
email body is the archive's `message` text verbatim — the one **unverified**
link — `parse.ts` needs no change at all.

### Metering

`Trigger` is `'schedule' | 'manual' | 'webapp'`. Received documents should be a
fourth, `'hf'`, so the meter can say what arrived by radio without counting it
against a NOAA byte budget it never touched. That is a one-line union change
plus wherever the meter renders.

### Tests

The fixtures are the received messages. A `.b2f` file with a `wwv.txt` body, a
subscription alert email, a Saildocs reply with whatever header it turns out to
wear — dropped into `examples/` with a dated name, exactly as
[CLAUDE.md](../CLAUDE.md) requires for a NOAA payload. The whole ingest path is
file-in, delta-out, so it tests offline by construction and the no-network rule
holds untouched.

## The config surface, against CLAUDE.md's bar

[CLAUDE.md](../CLAUDE.md#conventions): a setting has to be "a decision only the
boat owner can make — one where a sensible default would be wrong for someone,
and where they can tell the difference."

**One setting earns its place.**

`hfMailboxDir` — a string, `type: 'string'`, `default: ''`, describing the
directory to watch. Empty means the whole feature is off, which is the right
default for the overwhelming majority of installs. It clears the bar
comfortably: where a boat's radio email lands is a fact only the owner knows,
no default is right (Pat, Airmail, Winlink Express and an IMAP drop all differ,
and Pat's own path includes the callsign), and the owner can tell instantly
whether it is right because either bulletins appear or they do not.

**Deliberately one setting, not two.** The obvious `hfIngestEnabled` boolean
beside it carries no information the path does not; an empty path already says
"off". The cost is that switching the feature off temporarily means clearing a
path the operator then has to retype — a real but small annoyance, against a
form that is already at ten properties. Take the smaller form; revisit if
anyone actually asks to toggle it.

**Rejected, with reasons, because each will be proposed:**

- **A watch interval.** The filesystem says when a file appears. A dial here
  buys nothing and can only be set wrong.
- **A source-type select (directory / Pat API / IMAP).** There is one mechanism.
  A select over one option is not a setting.
- **A "trust received data" or "maximum age" control.** The bulletin states its
  own issue time and the paths already declare `timeout`. Age is derived, not
  chosen.
- **Separate loudness for HF-received alerts.** `alarmLevel` and `popupLevel`
  own loudness for every source, and CLAUDE.md is explicit that state is the
  only input to `methodForState`. A received G4 is a G4.
- **Per-product ingest toggles.** Which bulletins arrive is decided by what the
  operator subscribed to at Saildocs. The plugin ingesting a file that is
  already on the boat costs nothing worth a checkbox.
- **Anything that composes or sends a request.** Not a setting; a licence
  violation. See the top of this file.

The form description should say what the feature does _not_ do — that the
plugin never transmits and never triggers a radio session — because that is the
question an operator will have, and the answer is the reassuring one.

## What is still unverified

Everything below needs one operator with a Winlink or Sailmail account and one
message. None of it blocks the design; all of it blocks quoting a number.

1. **The Saildocs reply's own overhead** — the header it wraps a returned
   document in, and therefore the real per-message cost. Estimated at a few
   hundred bytes above; not measured.
2. **Whether Saildocs returns `/text/drap_global_frequencies.txt` intact**
   (42.5 KB, 90×90 numeric table), and what it does to a `.json` URL.
3. **Whether an SWPC subscription email's body is the archive's `message` text
   verbatim.** Decides whether `parseAlert` runs unchanged or needs an unwrap.
4. **Whether `sub <url>` accepts `interval=` for URL documents** the way it does
   for bulletin codes. The documentation says "any request" can become a
   scheduled delivery and does not carve URLs out, but it only shows
   `interval=` on a bulletin code.
5. **Airmail's on-disk message store** — whether it is a directory of files a
   watcher can read.
6. **The Worldwide Marine Radiofacsimile Broadcast Schedules PDF** — scanned
   only the OPC Atlantic schedule page for space-weather products.
7. **JS8's actual throughput**, quoted from vendor documentation as ~16 WPM in
   normal mode.
8. **Whether VARA HF sessions can be monitored by a third party.** No monitor
   was found and VARA is closed-source, but absence of a search result is not
   proof. PMON's PACTOR coverage is documented; VARA's is not.
9. **Whether PACTOR-3 has a one-way FEC/unproto broadcast mode.** Documented for
   PACTOR-1 and PACTOR-2; not established for PACTOR-3, and a bulletin station's
   throughput depends on the answer.

## Follow-up issues

To file, not filed here. In dependency order; the first four are the feature.

1. **`feat: read SWPC bulletins from a watched mailbox directory`** — the
   `Client` implementation over a directory of files, `:Product:` recognition,
   `.b2f` body extraction, and the endpoint mapping. The core of the work.
2. **`feat: one issue-time high-water mark per endpoint, shared by both
transports`** — the ledger described above, over `entryCache`; a `parseIssueDate`
   sibling for D-RAP's `Product Valid At`. Must land with or before #1: without
   it, a stale mailbox copy can overwrite a fresh fetch.
3. **`feat: ingest SWPC alert emails through parseAlert unchanged`** — the
   `issue_datetime` adapter, and the sparse-set behaviour against
   `currentAlertNotifications`. Blocked on unverified item 3.
4. **`feat: hfMailboxDir setting and its form description`** — one property,
   with the "never transmits" sentence.
5. **`chore: add 'hf' to Trigger so received documents are metered apart from
fetches`** — small, and it makes the webapp able to say how a value arrived.
6. **`docs: an operator recipe for space weather over Winlink and Sailmail`** —
   the exact `sub` lines, the SWPC subscription set matched to the boat's
   thresholds, and the Saildocs terms constraint stated plainly. This is the
   deliverable an actual cruiser wants, and it is useful before any code ships.
7. **`research: measure a real Saildocs reply`** — closes unverified items 1, 2
   and 4 in one session with a radio.
8. **`research: is a shared PACTOR bulletin receivable at sea?`** — the one that
   changes the shape of the initiative rather than the plugin: PMON makes the
   receive side free for every boat, so the question is whether a partner
   station will run a scheduled one-way bulletin and whether PACTOR-3 offers an
   unproto mode to run it in. Closes unverified items 8 and 9. Needs an amateur
   partner; nothing is keyed before a Part 97 read on the addressing.
9. **Deferred, open only if asked:** IMAP or Pat's HTTP API as a second source.
