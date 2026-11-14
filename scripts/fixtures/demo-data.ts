/**
 * Static content for the demo seed (scripts/seed-demo.ts): products, customers, review texts.
 * Kept separate so the seeder reads as logic, and so the data is easy to tweak.
 * Everything here is fictional. Emails use the reserved ".test" TLD so nothing can ever be delivered.
 */

export type DemoOption =
  | { type: "color"; label: string; required: boolean; values: [label: string, hex: string, deltaCents?: number][] }
  | { type: "size"; label: string; required: boolean; values: [label: string, code: string, deltaCents?: number][] }
  | { type: "text"; label: string; required: boolean; deltaCents?: number; maxLen: number }
  | { type: "image"; label: string; required: boolean; deltaCents?: number };

export type DemoProduct = {
  slug: string;
  name: string;
  category: string;
  priceCents: number;
  description: string;
  status: "published" | "draft" | "archived";
  /** Number of photos (0, 1 or 2) so we see cards with and without images. */
  photos: 0 | 1 | 2;
  model: "box" | "cylinder" | "wedge" | "ring" | null;
  options: DemoOption[];
};

const COLORS: [string, string, number?][] = [
  ["Matte Black", "#1f2937"],
  ["Snow White", "#f8fafc"],
  ["Sky Blue", "#38bdf8"],
  ["Sunset Orange", "#fb923c"],
  ["Forest Green", "#16a34a"],
  ["Rose Pink", "#f472b6"],
  ["Silk Gold", "#eab308", 30],
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "demo-honeycomb-organizer",
    name: "Honeycomb Desk Organizer",
    category: "desk",
    priceCents: 45000,
    description:
      "A modular honeycomb tray for pens, clips and small tools. Print-ready in PETG for a sturdy, slightly glossy finish. Each cell is 28 mm wide so standard markers fit snugly.",
    status: "published",
    photos: 2,
    model: "cylinder",
    options: [
      { type: "color", label: "Color", required: true, values: COLORS },
      { type: "size", label: "Size", required: true, values: [["Small (3 cells)", "S"], ["Medium (7 cells)", "M", 6000], ["Large (12 cells)", "L", 12000]] },
    ],
  },
  {
    slug: "demo-cable-clip-set",
    name: "Cable Clip Set (5 pcs)",
    category: "desk",
    priceCents: 9500,
    description: "Five adhesive-backed clips that keep charging cables from sliding off your desk.",
    status: "published",
    photos: 1,
    model: "ring",
    options: [{ type: "color", label: "Color", required: true, values: COLORS.slice(0, 4) }],
  },
  {
    slug: "demo-lowpoly-planter",
    name: "Low-Poly Succulent Planter",
    category: "home",
    priceCents: 28000,
    description:
      "Geometric planter with a drainage hole and removable saucer. Looks great with echeveria and haworthia. Pot only, plant not included.",
    status: "published",
    photos: 2,
    model: "wedge",
    options: [
      { type: "color", label: "Color", required: true, values: COLORS },
      { type: "size", label: "Size", required: true, values: [["8 cm", "S"], ["11 cm", "M", 8000]] },
    ],
  },
  {
    slug: "demo-articulated-dragon",
    name: "Articulated Dragon",
    category: "toys",
    priceCents: 35000,
    description:
      "Printed in one piece with flexible joints, no assembly needed. Poses on a desk, shelf or monitor. Each dragon is printed in a single color or a smooth two-tone gradient. This is a deliberately long description to check how product cards and the product page handle several lines of text without breaking the layout: dragons have long tails, long wings, and apparently long descriptions too.",
    status: "published",
    photos: 2,
    model: "box",
    options: [{ type: "color", label: "Color", required: true, values: COLORS }],
  },
  {
    slug: "demo-name-plate-desk",
    name: "Custom Desk Name Plate",
    category: "signs",
    priceCents: 32000,
    description: "Your name or title in bold raised letters on a sturdy base. Great for office desks and graduation gifts.",
    status: "published",
    photos: 2,
    model: "box",
    options: [
      { type: "color", label: "Base color", required: true, values: COLORS.slice(0, 5) },
      { type: "text", label: "Name or title", required: true, deltaCents: 2000, maxLen: 14 },
    ],
  },
  {
    slug: "demo-gridfinity-workshop-bin-starter-pack-large",
    name: "Gridfinity Tool Bin Starter Pack with Baseplate and Labeled Dividers (Large Workshop Edition)",
    category: "general",
    priceCents: 125000,
    description:
      "A very long product name on purpose, to see how cards, tables, carts, order summaries and the acknowledgment cope with it. Includes a 5×5 baseplate, 12 bins and 20 dividers.",
    status: "published",
    photos: 1,
    model: "box",
    options: [{ type: "color", label: "Color", required: true, values: COLORS.slice(0, 3) }],
  },
  {
    slug: "demo-mini-fidget-spinner",
    name: "Mini Fidget Spinner",
    category: "toys",
    priceCents: 12000,
    description: "Smooth, quiet and pocket-sized. No options: one color per batch.",
    status: "published",
    photos: 1,
    model: "ring",
    options: [],
  },
  {
    slug: "demo-photo-lithophane-lamp",
    name: "Photo Lithophane Night Lamp",
    category: "gifts",
    priceCents: 89000,
    description:
      "Your photo becomes a glowing 3D-printed picture when the lamp is on. Upload a clear, high-contrast photo; we convert it. Warm-white LED base included.",
    status: "published",
    photos: 2,
    model: "box",
    options: [
      { type: "image", label: "Your photo", required: true, deltaCents: 0 },
      { type: "size", label: "Size", required: true, values: [["Square 12 cm", "SQ"], ["Portrait 15 cm", "PT", 15000]] },
    ],
  },
  {
    slug: "demo-wall-hook-trio",
    name: "Wall Hook Trio",
    category: "home",
    priceCents: 18000,
    description: "Three screw-mount hooks. (This product has no photo, to check the empty-image state.)",
    status: "published",
    photos: 0,
    model: null,
    options: [{ type: "color", label: "Color", required: true, values: COLORS.slice(0, 3) }],
  },
  {
    slug: "demo-cosplay-helmet-prop-kit",
    name: "Cosplay Helmet Prop Kit",
    category: "gifts",
    priceCents: 1250000,
    description: "A full-size helmet printed in 14 parts with fastening hardware. Sanding and painting guide included. Priced high on purpose to test large peso amounts.",
    status: "published",
    photos: 2,
    model: "cylinder",
    options: [{ type: "size", label: "Head size", required: true, values: [["Medium (56 to 58 cm)", "M"], ["Large (59 to 61 cm)", "L", 20000]] }],
  },
  {
    slug: "demo-headphone-hook",
    name: "Under-Desk Headphone Hook",
    category: "stands",
    priceCents: 15000,
    description: "Draft product: not visible to customers.",
    status: "draft",
    photos: 1,
    model: "wedge",
    options: [{ type: "color", label: "Color", required: true, values: COLORS.slice(0, 2) }],
  },
  {
    slug: "demo-phone-stand-v1",
    name: "Phone Stand v1 (retired)",
    category: "stands",
    priceCents: 16000,
    description: "Archived product: replaced by a newer design.",
    status: "archived",
    photos: 1,
    model: "wedge",
    options: [],
  },
];

export type DemoCustomer = {
  name: string;
  slug: string;
  phone: string;
  line1: string;
  line2?: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
};

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { name: "Maria Clara Santos", slug: "maria-santos", phone: "09171234501", line1: "12 Mabini St.", barangay: "Brgy. San Roque", city: "San Pablo City", province: "Laguna", postalCode: "4000" },
  { name: "Juan Dela Cruz", slug: "juan-delacruz", phone: "09281234502", line1: "Blk 4 Lot 18 Sampaguita Homes", line2: "Phase 2", barangay: "Brgy. Dila-Dila", city: "Santa Rosa", province: "Laguna", postalCode: "4026" },
  { name: "Ana Beatriz Reyes-Villanueva", slug: "ana-reyes", phone: "09391234503", line1: "Unit 1204, Skyline Residences Tower B, 25th Street corner Bonifacio Avenue", barangay: "Bonifacio Global City", city: "Taguig", province: "Metro Manila", postalCode: "1634" },
  { name: "Jose Rizal Jr.", slug: "jose-rizal", phone: "09451234504", line1: "88 Calamba Road", barangay: "Brgy. Real", city: "Calamba", province: "Laguna", postalCode: "4027" },
  { name: "Katrina Ñoño Macaraeg", slug: "katrina-macaraeg", phone: "09561234505", line1: "5 Acacia Lane", barangay: "Brgy. Poblacion", city: "Lipa City", province: "Batangas", postalCode: "4217" },
  { name: "Mark Anthony O'Brien", slug: "mark-obrien", phone: "09671234506", line1: "21 Dewey Ave.", barangay: "Brgy. Barretto", city: "Olongapo City", province: "Zambales", postalCode: "2200" },
  { name: "Bea", slug: "bea", phone: "09781234507", line1: "3 Rizal St", barangay: "", city: "Cebu City", province: "Cebu", postalCode: "6000" },
  { name: "Carlo Miguel Fernandez", slug: "carlo-fernandez", phone: "09891234508", line1: "Purok 3", barangay: "Brgy. Matina Crossing", city: "Davao City", province: "Davao del Sur", postalCode: "8000" },
  { name: "Lourdes Magsaysay-Aquino", slug: "lourdes-aquino", phone: "09101234509", line1: "17 Aguinaldo Highway", line2: "Near the blue gate", barangay: "Brgy. Anabu", city: "Imus", province: "Cavite", postalCode: "4103" },
  { name: "Paolo Bautista", slug: "paolo-bautista", phone: "09211234510", line1: "9 Katipunan Ave", barangay: "Brgy. Loyola Heights", city: "Quezon City", province: "Metro Manila", postalCode: "1108" },
  { name: "Trixie Mae Villareal", slug: "trixie-villareal", phone: "09321234511", line1: "Lot 7 Bayview Subdivision", barangay: "Brgy. Sta. Cruz", city: "San Pedro", province: "Laguna", postalCode: "4023" },
  { name: "Ramon Magno", slug: "ramon-magno", phone: "09431234512", line1: "44 Burgos St", barangay: "Brgy. 5", city: "Iloilo City", province: "Iloilo", postalCode: "5000" },
  { name: "Daniela Cruz-Lim", slug: "daniela-cruzlim", phone: "09541234513", line1: "2F Lim Building, 101 Session Road", barangay: "Brgy. Kayang", city: "Baguio City", province: "Benguet", postalCode: "2600" },
  { name: "Eduardo Santiago III", slug: "eduardo-santiago", phone: "09651234514", line1: "15 Quezon Blvd", barangay: "Brgy. Maunlad", city: "Naga City", province: "Camarines Sur", postalCode: "4400" },
];

export const REVIEW_BODIES: { stars: number; body: string }[] = [
  { stars: 5, body: "Exactly as pictured, and the color matched the preview. Packed really well too." },
  { stars: 5, body: "Super sulit! Mas maganda pa sa inaasahan ko. Will order again for my officemates." },
  { stars: 5, body: "" },
  { stars: 5, body: "Fast turnaround, the seller even messaged me updates. Highly recommended." },
  { stars: 4, body: "Great quality print, tiny layer lines visible up close but that's expected. Happy with it." },
  { stars: 4, body: "Nice gift for my brother. Delivery took 4 days to Visayas." },
  { stars: 4, body: "" },
  { stars: 5, body: "Perfect fit! I measured twice before ordering and it works great with my setup. The engraved text came out crisp and centered, and the finish is smoother than I expected from a 3D print. I've already recommended it to two friends." },
  { stars: 3, body: "Okay overall. The color was a bit darker than the preview on my screen." },
  { stars: 3, body: "Good product but shipping took longer than I hoped." },
  { stars: 2, body: "One of the corners had a small defect. Seller replied quickly though." },
  { stars: 1, body: "Arrived cracked. Waiting for the replacement." },
  { stars: 5, body: "Love it 😍 my desk finally looks organized!" },
  { stars: 4, body: "Solid. Would be 5 stars if there were more color choices." },
];

export const CARRIERS = ["J&T Express", "LBC", "Flash Express", "Grab Express"];
