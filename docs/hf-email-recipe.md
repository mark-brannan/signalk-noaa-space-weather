# Space weather over Winlink or Sailmail: an operator recipe

For a boat on HF email with no IP. One message you type from the boat and one
web form you fill in before you leave put the bulletins an HF operator reads
conditions by into the mailbox every few hours.

This is the operator's half of
[#86](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/86);
the research behind it, and the plugin ingest it proposes, are in
[hf-email-transport.md](hf-email-transport.md). Checked 2026-10-10. **Today
the plugin does not read these messages**: they land in your mail client and
you read them there. Nothing below changes when it does.

Anything not yet seen working is marked **unverified**, and all of it is
collected under [What this recipe has not verified](#what-this-recipe-has-not-verified).

## The rule: you send the requests

Saildocs' [terms](https://saildocs.com/terms) (last updated 2025-10-28),
conditions 3 and 4:

> Requests from any automated process via any means requires an agreement. An
> "automated process" in this case means anything other than an individual
> person manually initiating an individual request which is sent directly to
> Saildocs.
>
> Redirection of any request from any other email address, or initiated from
> any website or device app interaction requires an agreement.

So:

- **Type the `sub` lines yourself**, in your own mail client, and send them
  from the mailbox you want the replies in. A scheduled delivery entered that
  way is Saildocs' own feature, run by Saildocs; you asked for it once, by hand.
- **Do not script, schedule or forward them.** No cron job, no mail rule, no
  "send for me" button, and not this plugin: it never composes a request and
  never triggers a radio session
  ([why](hf-email-transport.md#the-constraint-that-shapes-everything-the-plugin-never-transmits)).
- Part 2 needs no request from the boat at all: it is a web form, filled in
  ashore.

## Part 1: the briefing, from Saildocs

Send this once, from the boat:

```
To: query@saildocs.com
Subject: anything

sub https://services.swpc.noaa.gov/text/wwv.txt time=00:00 interval=6 days=0
sub https://services.swpc.noaa.gov/text/3-day-forecast.txt time=01:00 days=0
sub https://services.swpc.noaa.gov/text/advisory-outlook.txt time=04:00 interval=24 days=0
-----
```

The line of five or more dashes ends the request. Leave it in: Saildocs
[may not answer](https://saildocs.com/info) if a mail footer follows the
commands. It is an anti-spam measure that Saildocs does not apply to mail
sent from Sailmail, and it does no harm there.

`time=` is the first delivery in UTC, `interval=` the hours between
deliveries (the default is daily), `days=` how long the subscription runs (the
default is 14).

| Line                   | What it brings                                                          | When (UTC)     | Size    | A week, as written |
| ---------------------- | ----------------------------------------------------------------------- | -------------- | ------- | ------------------ |
| `wwv.txt`              | Solar flux, estimated planetary A, current K, 24 h summary and forecast | 00, 06, 12, 18 | 540 B   | 15,120 B           |
| `3-day-forecast.txt`   | NOAA's plain-language 3-day outlook                                     | daily 01:00    | 1,907 B | 13,349 B           |
| `advisory-outlook.txt` | The weekly space weather advisory outlook                               | daily 04:00    | 1,538 B | 10,766 B           |

Sizes are the research's, measured 2026-08-29; the same URLs returned 578,
2,297 and 723 bytes on 2026-10-10. As written that is about 39 KB a week of
plain text (30 KB with one outlook a week, below), before Saildocs' own
wrapper ([unverified](#what-this-recipe-has-not-verified)). Against Sailmail's
90 minutes a week that is single-digit minutes; the working is under
[the size budget](hf-email-transport.md#the-size-budget).

Two things about those lines to know before you send them:

- **`time=00:00` delivers the previous bulletin.** SWPC issues a few minutes
  after the hour: the 0900 bulletin fetched on 2026-10-10 says
  `:Issued: 2026 Oct 10 0905 UTC`, and the research's sample says 0305 (two
  samples, not a survey). A request at exactly 00:00 would get the 2100
  one. Moving each `time=` a quarter hour later (`time=00:15`) would deliver
  the bulletin for its own slot; whether Saildocs honours a time to the minute
  is **unverified**.
- **The third line delivers every day, not every week.** `interval=24` is a
  daily delivery, and the advisory outlook is issued about weekly (the two on
  hand are Monday 27 July and Monday 5 October 2026), so most copies are
  repeats. One a week would be `interval=168`; whether Saildocs accepts an
  interval that long is **unverified**.

**Check it took.** Saildocs confirms every change to a subscription. To see
the whole list, send:

```
To: query@saildocs.com
Subject: anything

status
-----
```

The format of that listing is **unverified**; look for the schedule it holds
for the `wwv.txt` line. If it is daily, Saildocs did not take `interval=` on a
URL and you have one bulletin a day, which is still useful.

**When the 14 days run out.** `days=0` is documented as "indefinite" only on
Saildocs' [grib page](https://saildocs.com/gribinfo) for grib subscriptions;
that it works for a URL is **unverified**. If the confirmation shows a finite
period, send the lines again before it ends.

**To stop** (before weeks in port with no radio sessions, say), send
`cancel <url>` for each line, in the same shape as above; the grammar is
documented for bulletin codes, and for a URL it is **unverified**.

### What a reply contains

The document is SWPC's own text. This is `wwv.txt` as fetched 2026-10-10
(578 bytes); Saildocs' header around it in the reply is **unverified**:

```
:Product: Geophysical Alert Message wwv.txt
:Issued: 2026 Oct 10 0905 UTC
# Prepared by the US Dept. of Commerce, NOAA, Space Weather Prediction Center
#
#          Geophysical Alert Message
#
Solar-terrestrial indices for 09 October follow.
Solar flux 121 and estimated planetary A-index 11.
The estimated planetary K-index at 0900 UTC on 10 October was 3.00.

Space weather for the past 24 hours has been minor.
Radio blackouts reaching the R1 level occurred.

Space weather for the next 24 hours is predicted to be moderate.
Radio blackouts reaching the R2 level are likely.
```

That is "SFI 121, A 11, K 3", and the README says how to read
[the phrase](../README.md#reading-conditions-like-an-hf-operator).

### On demand

Fetched when you want them, not on a schedule:

```
To: query@saildocs.com
Subject: anything

send https://services.swpc.noaa.gov/text/current-space-weather-indices.txt
send https://services.swpc.noaa.gov/text/27-day-outlook.txt
-----
```

The D-RAP absorption grid answers "can I use HF right now, on this band, at
this latitude", and it is 42,499 bytes of plain text (measured 2026-10-10):

```
send https://services.swpc.noaa.gov/text/drap_global_frequencies.txt
```

Send it alone, before a passage or when conditions are in question, never as a
`sub`. A copy that sat in the mailbox is a historical document. Whether
Saildocs returns all of it intact, and whether Sailmail's stated 10 KB PACTOR-2
limit (written for grib attachments) applies to a text body that size, are
**unverified**.

## Part 2: warnings and alerts, from SWPC itself

SWPC emails alerts, warnings, watches and summaries "within moments of being
issued" to any address registered
([subscription services](https://www.spaceweather.gov/content/subscription-services)).
Nothing here is built, relayed or requested over the radio.

1. Before you leave, with an internet link, open
   <https://pss.swpc.noaa.gov> and follow the **register** link ("New user?").
   Use the boat's radio address as the email address. The form is a website,
   so this cannot be done from the boat. Whether SWPC asks you to confirm the
   address by return mail is **unverified**; find out in port.
2. Select the products below, then review your choices.

### Which products

The plugin has three thresholds, `alarmLevel`, `popupLevel` and `listLevel`
(defaults 5, 4, 3), and they apply to the G, S and R scales alike
([README](../README.md#configuration)). **Subscribe to every code at or above
the lowest threshold you have not set to "Never"**; below it the plugin would
not even list the message. At the defaults that is level 3. The plugin cannot
read these messages yet, so until it can the thresholds only say what it would
act on; if you read the mail yourself, pick your own floor.

| NOAA level | Geomagnetic (G)   | Radiation (S)              | Radio blackout (R) |
| ---------- | ----------------- | -------------------------- | ------------------ |
| 1 Minor    | `ALTK05` `WARK05` | `ALTPX1` `SUMPX1` `WARPX1` | no product         |
| 2 Moderate | `ALTK06` `WARK06` | `ALTPX2` `SUMPX2`          | `ALTXMF` `SUMXM5`  |
| 3 Strong   | `ALTK07` `WARK07` | `ALTPX3` `SUMPX3`          | `SUMX01`           |
| 4 Severe   | `ALTK08`          | `ALTPX4` `SUMPX4`          | `SUMX10`           |
| 5 Extreme  | `ALTK09`          | `ALTPX5` `SUMPX5`          | `SUMX20`           |

`ALT` says it is happening, `WAR` that it is expected, `SUM` that it is over
and what the peak was. Take all of them at your level: a warning is lead time.
Levels are from the NOAA Scale column of the
[subscription page](https://www.spaceweather.gov/content/subscription-services).

**`WARPX1` is the one proton warning, for S1 to S5** (the page lists it as
S1-S5). All 11 in the archives read S1, so it sits in the level 1 row; a bigger
event would arrive on the same code, so if your floor is higher, taking it
still costs about one message every eight days.

**R3 and above arrive after the fact.** The page says "an Alert is only
issued for exceedance of M5 (R2)", so the larger flares reach a mailbox only
as `SUMX01`, `SUMX10` and `SUMX20`, issued when the event is over.

**Leave the rest unticked.** `ALTK04`, `WARK04`, `ALTEF3`, `ALTTP2`,
`ALTTP4`, `SUM10R`, the 100 MeV proton codes (`ALTPC0`, `SUMPC0`, `WARPC0`)
and the sudden-impulse codes (`WARSUD`, `SUMSUD`) carry no `NOAA Scale:` line,
so no threshold applies to them and the plugin never raises them. In the
core's three 30-day archives they are 245 of 498 messages, `WARK04` alone 122. (The page spells the K-index-4 alert `ATLK04`; SWPC's
payload spells it `ALTK04`.)

**Watches are the one optional extra.** `WATA20`, `WATA30`, `WATA50` and
`WATA99` carry no scale line either, so they never raise a notification, but
they are the only message that says a storm is on its way, days ahead, with a
day-by-day forecast. There were 20 in those archives, 739 to 1,003 bytes each.
Without them the earliest notice of a geomagnetic storm is a warning, which
the page says is "generally only issued minutes to a couple of hours in
advance".

### What it costs

Message text of the codes in the table at or above each level (`WARPX1` at
level 1 only), counted from the same archives: three 30-day windows ending
2025-04-11, 2025-04-17 and 2026-08-01, and the 8 days around the May 2024
Gannon storm, the worst the fixtures hold.

| Lowest level you use | A day, in an ordinary month           | A day, in the Gannon storm |
| -------------------- | ------------------------------------- | -------------------------- |
| 1                    | 1.6 to 3.4 messages, 1.0 to 2.4 KB    | 9.2 messages, 6.8 KB       |
| 2                    | 0.7 to 1.1 messages, 0.5 to 0.9 KB    | 6.2 messages, 5.1 KB       |
| 3 (the defaults)     | 0.07 to 0.24 messages, 0.04 to 0.2 KB | 3.7 messages, 3.2 KB       |
| 4                    | 0 to 0.03 messages, 0 to 0.03 KB      | 1.5 messages, 1.4 KB       |
| 5                    | none                                  | 0.4 messages, 0.4 KB       |

At the defaults that is under two messages a week in an ordinary month.

### Instead of Saildocs

The same form lists the WWV bulletin (every 3 hours), the 3-day forecast, the
27-day forecast and the daily indices as email products. That route would
bring the briefing without a Saildocs request at all. Whether those emails
carry the same text as the `.txt` files is **unverified**, so this recipe uses
Saildocs for them.

## It is a briefing, not a pager

HF email is polled by you. A G4 alert issued at 0300 reaches the boat when you
next connect, which might be at 1400, and the message says when it was
issued. Do not rely on this channel to tell you a storm has started; it tells
you what the sky has been doing, and what NOAA expects next.

## What this recipe has not verified

Each needs one message and one reply from a real Winlink or Sailmail account.
The first four are items 1, 2, 3 and 4 of
[the research list](hf-email-transport.md#what-is-still-unverified); one real
reply closes the first, second and fourth (follow-up 7 in
[the follow-ups](hf-email-transport.md#follow-up-issues)).

1. **Saildocs' reply wrapper**, and therefore the real size of each message.
2. **Whether the 42,499-byte D-RAP grid comes back intact.**
3. **Whether an SWPC email's body is the archive's message text verbatim.**
4. **Whether `interval=` works on a URL.** If not, `wwv.txt` is daily.
5. **Whether `days=0` and `cancel` work on a URL.** If not, the subscription
   lapses in 14 days.
6. **Whether `time=` is honoured to the minute, and whether `interval=168` is
   accepted.** The two timing fixes above depend on them.
7. **Whether SWPC confirms a new address by return mail.**
8. **Whether SWPC's WWV, 3-day and other forecast emails carry the same text
   as the `.txt` files.**
