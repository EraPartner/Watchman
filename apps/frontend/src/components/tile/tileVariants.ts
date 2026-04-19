import { cva, type VariantProps } from "class-variance-authority";

/**
 * ServiceTile size + density variants. Size maps to grid span + internal
 * padding; density tunes gap between metric rows.
 */
export const tileVariants = cva(
  [
    "relative flex flex-col overflow-hidden",
    "transition-[transform,box-shadow,border-color] duration-fast ease-out-q",
    "will-change-transform",
  ],
  {
    variants: {
      size: {
        S: "col-span-3 row-span-2",
        M: "col-span-4 row-span-3",
        L: "col-span-6 row-span-3",
        XL: "col-span-8 row-span-4",
      },
      density: {
        comfortable: "gap-s-3",
        compact: "gap-s-2",
      },
      interactive: {
        true: "cursor-pointer hover:-translate-y-px",
        false: "",
      },
    },
    defaultVariants: {
      size: "M",
      density: "comfortable",
      interactive: true,
    },
  }
);

export type TileVariantProps = VariantProps<typeof tileVariants>;
export type TileSize = NonNullable<TileVariantProps["size"]>;
export type TileDensity = NonNullable<TileVariantProps["density"]>;
