export const CATEGORIES = [
  "Programming",
  "AI & ML",
  "Finance & Investing",
  "Business",
  "Science",
  "Health",
  "Law",
  "Writing",
  "Education",
  "Cooking",
  "Travel",
  "Home",
  "Career",
  "Productivity",
  "Design",
  "Marketing",
  "Personal",
  "Other",
] as const;

interface CategoryChipsProps {
  selectedCategory?: string;
  onSelectCategory: (category?: string) => void;
}

export function CategoryChips({ selectedCategory, onSelectCategory }: CategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 py-2">
      <button
        type="button"
        onClick={() => onSelectCategory(undefined)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          !selectedCategory
            ? "bg-gray-900 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        All
      </button>
      {CATEGORIES.map((cat) => {
        const isSelected = selectedCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategory(isSelected ? undefined : cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isSelected
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
