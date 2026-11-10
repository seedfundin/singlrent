export const MINIMUM_LISTING_AMENITIES = 10;

export const listingAmenityGroups = [
  {
    label: "Power & water",
    options: [
      "Band A electricity supply",
      "Prepaid meter (not shared)",
      "24/7 power backup",
      "Solar or inverter backup",
      "Borehole water",
      "Treated water",
      "Water heater",
      "Water storage tank",
      "Private bathroom",
    ],
  },
  {
    label: "Security & access",
    options: [
      "Gated compound",
      "Security personnel",
      "CCTV surveillance",
      "Secure parking",
      "Visitor parking",
      "Paved access road",
      "Private entrance",
    ],
  },
  {
    label: "Home comfort",
    options: [
      "Air conditioning",
      "Built-in wardrobes",
      "Furnished",
      "Balcony or private outdoor space",
      "Fitted kitchen",
      "Private kitchen",
      "Laundry area",
    ],
  },
  {
    label: "Connectivity & lifestyle",
    options: [
      "Fibre internet ready",
      "Gym or fitness area",
      "Elevator",
      "Pet friendly",
    ],
  },
] as const;
