import Link from "next/link";
import MenuSheet from "./menu-sheet";
import PlaceSearchBar from "./place-search-bar";
import AddressModal from "./address-modal";
import { fetchLocation } from "@/lib/restaurants/api";

async function Header() {
  const { lat, Ing } = await fetchLocation();
  console.log(`[Header] Rendering with location: ${lat}, ${Ing}`);
  return (
    <header className="bg-background fixed top-0 left-0 w-full z-50 border-b">
      <div className="flex flex-col md:flex-row md:items-center p-4 md:h-16 gap-3 md:gap-4 max-w-[1920px] mx-auto">

        {/* 上段: ロゴ・メニュー・食べログリンク */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-4">
            <MenuSheet />
            <div className="font-bold text-lg">
              <Link href={"/"}>Restaurants search APP</Link>
            </div>
          </div>
          <a
            href="https://tabelog.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline text-xs md:text-sm md:hidden"
          >
            食べログ
          </a>
        </div>

        {/* 下段（PC時は右側）: 検索・住所等 */}
        <div className="flex flex-col sm:flex-row flex-1 gap-3 w-full items-center">
          <div className="w-full sm:w-auto min-w-[120px] max-w-full truncate text-sm">
            <AddressModal />
          </div>
          <div className="flex-1 w-full">
            <PlaceSearchBar lat={lat} Ing={Ing} />
          </div>
          <a
            href="https://tabelog.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline text-sm hidden md:block shrink-0"
          >
            食べログで検索する
          </a>
        </div>

      </div>
    </header>
  );
}

export default Header
