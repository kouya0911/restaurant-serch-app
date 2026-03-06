import Link from "next/link";
import MenuSheet from "./menu-sheet";
import PlaceSearchBar from "./place-search-bar";
import AddressModal from "./address-modal";
import { fetchLocation } from "@/lib/restaurants/api";

async function Header() {
  const {lat, Ing} = await fetchLocation();
  return (
    <header className="bg-background h-16 fixed top-0 left-0 w-full z-50">
        <div className="flex items-center h-full space-x-4 px-4 max-w-[1920px] mx-auto">
            <MenuSheet />
            <div className="font-bold">
                <Link href={"/"}>Restaurants search APP</Link>
            </div>
            <AddressModal />
            <div className= "flex-1">
              <PlaceSearchBar lat={lat} Ing={Ing} />
            </div>
              <a
                href="https://tabelog.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline text-sm"
              >
                食べログで検索する
              </a>
          </div>
    </header>
  )
}

export default Header
