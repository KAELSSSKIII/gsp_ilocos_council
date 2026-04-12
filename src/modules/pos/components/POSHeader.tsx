import { ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

type POSHeaderProps = {
  cartCount: number;
};

export function POSHeader({ cartCount }: POSHeaderProps) {
  const navigate = useNavigate();

  const handleNavigateToCart = () => {
    navigate("/pos/cart");
  };

  return (
    <header className="sticky top-14 z-30 border-b border-border/60 bg-[#f9f7f3] backdrop-blur">
      <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-12">
        <div className="flex flex-col text-left">
          <h1 className="text-2xl font-semibold text-slate-800 sm:text-[28px] sm:leading-8">Point of Sale</h1>
          <p className="text-sm text-slate-500 sm:text-[15px]">
            Scan items, filter by category, and add products to the cart.
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={handleNavigateToCart}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-800 transition hover:border-emerald-400 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="View cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[11px] font-semibold text-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
