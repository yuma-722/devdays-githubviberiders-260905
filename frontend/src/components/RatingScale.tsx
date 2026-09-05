import { RATINGS, RATING_LABELS, type EventRating } from '../lib/survey';

interface RatingScaleProps {
  value: EventRating | null;
  onChange: (value: EventRating) => void;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
}

/** 1〜5 の満足度をラジオグループとして描画する（矢印キーで移動可能） */
export function RatingScale({ value, onChange, disabled, describedBy, invalid }: RatingScaleProps) {
  return (
    <div
      className="rating"
      role="radiogroup"
      aria-label="イベントの満足度"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required="true"
    >
      {RATINGS.map((rating) => {
        const id = `rating-${rating}`;
        const checked = value === rating;
        return (
          <label key={rating} className="rating__option" htmlFor={id} data-checked={checked}>
            <input
              className="visually-hidden"
              type="radio"
              id={id}
              name="eventRating"
              value={rating}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(rating)}
              aria-label={`${rating}: ${RATING_LABELS[rating]}`}
            />
            <span className="rating__number" aria-hidden="true">
              {rating}
            </span>
            <span className="rating__label" aria-hidden="true">
              {RATING_LABELS[rating]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
