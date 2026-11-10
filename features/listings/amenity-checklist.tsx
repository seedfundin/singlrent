import { Check, CircleAlert } from "lucide-react";
import { listingAmenityGroups, MINIMUM_LISTING_AMENITIES } from "@/features/listings/listing-amenities";
import "./amenity-checklist.css";

type AmenityChecklistProps = {
  selected: string[];
  onToggle: (amenity: string) => void;
  error?: string;
};

export function AmenityChecklist({ selected, onToggle, error }: AmenityChecklistProps) {
  const remaining = Math.max(0, MINIMUM_LISTING_AMENITIES - selected.length);
  const complete = remaining === 0;

  return <section className="amenity-checklist" aria-labelledby="listing-amenities-title">
    <header>
      <span>
        <small>Property features</small>
        <h3 id="listing-amenities-title">What does this home genuinely offer?</h3>
        <p>Choose every feature a tenant can rely on. Select at least {MINIMUM_LISTING_AMENITIES} before publishing.</p>
      </span>
      <strong className={complete ? "complete" : ""} aria-live="polite">
        {selected.length} selected
        <small>{complete ? "Requirement met" : `${remaining} more required`}</small>
      </strong>
    </header>

    <div className="amenity-checklist-groups">
      {listingAmenityGroups.map((group) => <fieldset key={group.label}>
        <legend>{group.label}</legend>
        <div>
          {group.options.map((amenity) => {
            const isSelected = selected.includes(amenity);
            return <button
              type="button"
              className={isSelected ? "selected" : ""}
              aria-pressed={isSelected}
              onClick={() => onToggle(amenity)}
              key={amenity}
            >
              <i aria-hidden="true"><Check size={13} /></i>
              {amenity}
            </button>;
          })}
        </div>
      </fieldset>)}
    </div>
    {error && <p className="amenity-checklist-error" role="alert"><CircleAlert size={14} /> {error}</p>}
  </section>;
}
