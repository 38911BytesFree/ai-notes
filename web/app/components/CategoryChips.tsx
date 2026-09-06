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
    <div className="flex flex-wrap gap-1.5 py-1">
      <button
        type="button"
        onClick={() => onSelectCategory(undefined)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
          !selectedCategory
            ? "bg-indigo-600 text-white"
            : "bg-[#16161f] text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f2a] border border-[#242432]"
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
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              isSelected
                ? "bg-indigo-600 text-white"
                : "bg-[#16161f] text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f2a] border border-[#242432]"
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
