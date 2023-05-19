import Nip28Channel from "./channel";
import { NostrEvent } from "./ident";

interface ArcadeListingInput {
  type: "l1";
  action: "buy" | "sell";
  item: string;
  content?: string
  price: number;
  currency?: string;
  amt: number;
  min_amt?: number;
  payments: string[];
  expiration: string;
}

interface ArcadeListing {
  type: "l1";
  action: "buy" | "sell";   
  item: string;             // bitcoin, or anything else
  content: string           // friendly message
  price: number;            //
  currency: string;         // espected currency for trade
  amt: number;              // max amount for sale
  min_amt?: number;         // min amount will accept (if not present... same as max)
  payments: string[];       // list of payment methods
  expiration: number;       // expiraton seconds
  id?: string;
  created_at?: number;       // epoch create time
  tags?: string[];
}

interface ArcadeOfferInput {
  type: "o1";
  listing_id: string;   // source listing id
  content?: string      // nice message with any details
  price: number;        // price offered (if different from listing)
  currency?: string;    // currency offered (if different from listing)
  amt: number;          // amount offered (should be >= min_amt <= amt)
  payment: string;     // payment type selection
  expiration: string;   // offer should be ignored after this time
}

interface ArcadeOffer {
  type: "o1";
  content: string
  price: number;
  currency: string;
  amt: number;
  payment: string;
  expiration: number;
  id?: string;
  created_at?: number;       // epoch create time
  tags?: string[];
}

export class ArcadeListings {
  channel_id: string;
  conn: Nip28Channel;
  constructor(conn: Nip28Channel, id: string) {
    this.conn = conn
    this.channel_id = id
  }

  async list(): Promise<ArcadeListing[]> {
    const ents = (await this.conn.list(this.channel_id, {"#x": ["listing"]})).map((el: NostrEvent)=>{
        const tag = el.tags.find((el)=>{
          return el[0] == "data"
        })
        if (!tag) {
          return null
        }
        const info: ArcadeListing = JSON.parse(tag[1])
        info.id = el.id
        info.content = el.content
        info.created_at = el.created_at
        return info
    })
    return ents.filter((el)=>{return el != null}) as ArcadeListing[]
  }

  async post(listing: ArcadeListingInput): Promise<ArcadeListing> {
    const secs = convertToSeconds(listing.expiration)
    if (!secs) {
      throw new Error(`invalid expiration ${listing.expiration}`)
    }
    const final: ArcadeListing = {
      type: listing.type,
      action: listing.action,
      amt: listing.amt,
      price: listing.price,
      item: listing.item,
      content: listing.content ? listing.content : "",
      currency: listing.currency ? listing.currency : "",
      expiration: secs,
      payments: listing.payments
    }
    const tags = [["x", "listing"], ["data", JSON.stringify(final)]]
    const content = listing.content ?? ""
    delete listing.content
    const ev = await this.conn.send(this.channel_id, content, undefined, tags)
    final.id = ev.id
    final.created_at = ev.created_at
    return final
  }

  async delete(listing_id: string): Promise<void> {
    // Implement the logic to delete a listing.
    // Use the provided listing_id to identify and remove the corresponding listing.
  }

  async postOffer(offer: ArcadeOfferInput): Promise<NostrEvent> {
    const secs = convertToSeconds(offer.expiration)
    if (!secs) {
      throw new Error(`invalid expiration ${offer.expiration}`)
    }
    const final: ArcadeOffer = {
      type: offer.type,
      amt: offer.amt,
      price: offer.price,
      content: offer.content ? offer.content : "",
      currency: offer.currency ? offer.currency : "",
      expiration: secs,
      payment: offer.payment
    }
    const tags = [["x", "offer"], ["data", JSON.stringify(final)]]
    const content = offer.content ?? ""
    delete offer.content
    return await this.conn.send(this.channel_id, content, offer.listing_id, tags)
  }

  async listOffers(listing_id: string): Promise<ArcadeOffer[]> {
      const ents = (await this.conn.list(this.channel_id, {"#x": ["offer"]})).map((el: NostrEvent)=>{
        const tag = el.tags.find((el)=>{return el[0] == "data"})
        const repl = el.tags.find((el)=>{return el[0] == "e" && el[1] == listing_id})
        if (!tag || !repl) {
          return null
        }
        const info: ArcadeOffer = JSON.parse(tag[1])
        info.id = el.id
        info.content = el.content
        info.created_at = el.created_at
        return info
    })
    return ents.filter((el)=>{return el != null}) as ArcadeOffer[]
  }
}

export function convertToSeconds(input: string): number | undefined {
  const durationRegex = /(\d+)\s*(s(?:econds?)?|m(?:in(?:utes?)?)?|h(?:ours?)?|d(?:ays?)?|w(?:eeks?)?|mon(?:ths?)?)/ig;
  const matches = input.match(durationRegex);

  if (!matches) {
    return undefined; // Invalid input format
  }

  let totalSeconds = 0;

  for (const match of matches) {
    const unitRegex = /(\d+)\s*(s(?:econds?)?|m(?:in(?:utes?)?)?|h(?:ours?)?|d(?:ays?)?|w(?:eeks?)?|mon(?:ths?)?)/i;
    const unitMatches = match.match(unitRegex);

    if (unitMatches) {
      const quantity = parseInt(unitMatches[1]);
      const unit = unitMatches[2].toLowerCase();

      switch (unit) {
        case 's':
        case 'seconds':
          totalSeconds += quantity;
          break;
        case 'm':
        case 'min':
        case 'minutes':
          totalSeconds += quantity * 60;
          break;
        case 'h':
        case 'hour':
        case 'hours':
          totalSeconds += quantity * 60 * 60;
          break;
        case 'd':
        case 'day':
        case 'days':
          totalSeconds += quantity * 24 * 60 * 60;
          break;
        case 'w':
        case 'week':
        case 'weeks':
          totalSeconds += quantity * 7 * 24 * 60 * 60;
          break;
        case 'mon':
        case 'month':
        case 'months':
          totalSeconds += quantity * 30 * 24 * 60 * 60; // Assuming 30 days per month
          break;
        default:
          return undefined; // Invalid unit
      }
    }
  }

  return totalSeconds;
}

export function formatDuration(duration: number): string {
  if (duration < 0) {
    throw new Error('Duration must be a non-negative number.');
  }

  const units: [string, number][] = [
    ['d', 24 * 60 * 60],
    ['h', 60 * 60],
    ['m', 60],
    ['s', 1],
  ];

  const parts: string[] = [];

  for (const [unit, seconds] of units) {
    const value = Math.floor(duration / seconds);
    if (value > 0) {
      parts.push(`${value}${unit}`);
      duration -= value * seconds;
    }
  }

  if (parts.length === 0) {
    return '0s';
  }

  return parts.join(' ');
}
