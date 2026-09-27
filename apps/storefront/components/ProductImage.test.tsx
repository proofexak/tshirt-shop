import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ProductImage } from "./ProductImage";

describe("ProductImage", () => {
  test("renders the placeholder when src is null or the image errors", () => {
    const { rerender } = render(<ProductImage src={null} alt="Classic Crew Tee" />);
    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();

    rerender(
      <ProductImage
        src="http://localhost:9000/static/1-classic-crew-tee-black.png"
        alt="Classic Crew Tee"
      />
    );
    expect(screen.queryByTestId("image-placeholder")).not.toBeInTheDocument();
    const img = screen.getByAltText("Classic Crew Tee");

    fireEvent.error(img);

    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
  });
});
