// "use client"

// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog"

// import {
//   Command,
//   CommandDialog,
//   CommandEmpty,
//   CommandGroup,
//   CommandInput,
//   CommandItem,
//   CommandList,
//   CommandSeparator,
//   CommandShortcut,
// } from "@/components/ui/command"
// import { useState, useEffect } from "react";
// import { useDebouncedCallback } from "use-debounce"
// import { v4 as uuidv4 } from "uuid";
// import { Address, AddressSuggestion } from "@/types";
// import { LoaderCircle, MapPin } from "lucide-react";
// import { selectSuggestionAction } from "@/app/(private)/actions/addressActions";
// import useSWR from "swr";

// interface AddressResponse {
//     addressList: Address[];
//     selectedAddress: Address;
// }

// export default function AddressModal() {
//     const [inputText, setInputText] = useState("");
//     const [sessionToken, setSessionToken] = useState(uuidv4());
//     const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
//     const [isLoading, setIsLoading] = useState(false)

//     const fetchSuggestions = useDebouncedCallback(
//         async () => {
//         if(!inputText.trim()) {
//             setSuggestions([])
//             return;
//         }
//         try {
//             const response = await fetch(`/api/address/autocomplete?input=${inputText}&sessionToken=${sessionToken}`);
//             const data:AddressSuggestion[] = await response.json()
//             setSuggestions(data)
//         } catch (error) {
//             console.error(error);
//         } finally {
//             setIsLoading(false);
//         }
//     }, 500);

//     useEffect(()=> {
//         if(!inputText.trim()) {
//             setSuggestions([])
//             return;
//         }
//         setIsLoading(true);
//         fetchSuggestions();
//     }, [inputText]);

//     const fetcher = (url:string) => fetch(url).then(res => res.json())

//     const { data, error, isLoading:loading } = useSWR<AddressResponse>(`/api/user/address`, fetcher)
 
//     if (error) return <div>failed to load</div>
//     if (isLoading) return <div>loading...</div>

//     const handleSelectSuggestion = async(suggestion:AddressSuggestion) => {
//         //suver actions呼び出し
//         try {
//             await selectSuggestionAction(suggestion, sessionToken)
//             setSessionToken(uuidv4());
//         } catch(error) {
//             alert("error")
//         }
//     }

//   return (
//     <Dialog>
//         <DialogTrigger>住所を選択</DialogTrigger>
//         <DialogContent>
//             <DialogHeader>
//                 <DialogTitle>住所</DialogTitle>
//                 <DialogDescription className="sc-only">
//                     住所登録と選択
//                 </DialogDescription>
//             </DialogHeader>
//             <Command shouldFilter={false}>
//                 <div className="bg-muted mb-4">
//                     <CommandInput 
//                     value={inputText}
//                     onValueChange={setInputText} 
//                     placeholder="Type a command or search..."
//                     />
//                 </div>
//                 <CommandList>
//                     {inputText ? (
//                         <>
//                             <CommandEmpty>
//                                 {isLoading ? <LoaderCircle className="animate-spin" /> : "住所が見つかりません。"}
//                             </CommandEmpty>
//                             {suggestions.map((suggestion) => {
//                             return (
//                                 <CommandItem onSelect={() => handleSelectSuggestion(suggestion)} key={suggestion.placeId} className="p-5">
//                                 <MapPin />
//                                 <div>
//                                     <p className="font-bold">{suggestion.placeName}</p>
//                                     <p className="text-muted-foreground">{suggestion.address_text}</p>
//                                 </div>
//                                 </CommandItem>
//                             )
//                             })}
//                         </>
//                     ) : (
//                         // 登録済み住所
//                         <>
//                             <h3 className="font-black text-lg mb-2">保存済みの住所</h3>
//                             {data?.addressList.map((address) => (
//                                 <CommandItem className="p-5">
//                                     <p>{address.name}</p>
//                                     <p>{address.address_text}</p>
//                                 </CommandItem>
//                             ))}
//                         </>
//                     )}
//                 </CommandList>
//             </Command>
//         </DialogContent>
//     </Dialog>
//   )
// }

'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useState, useEffect, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce"
import { v4 as uuidv4 } from "uuid";
import { Address, AddressSuggestion } from "@/types";
import { LoaderCircle, MapPin, Trash2 } from "lucide-react";
import { deleteAddressAction, selectAddressAction, selectSuggestionAction } from "@/app/(private)/actions/addressActions";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { useRouter } from "next/navigation";

interface AddressResponse {
  addressList: Address[];
  selectedAddress?: Address | null;
}

export default function AddressModal() {
  const [inputText, setInputText] = useState("");
  const [sessionToken, setSessionToken] = useState(() => uuidv4());
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  const fetchSuggestions = useDebouncedCallback(
    async () => {
      if (!inputText.trim()) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/address/autocomplete?input=${encodeURIComponent(inputText)}&sessionToken=${sessionToken}`);
        const data: AddressSuggestion[] = await response.json();
        console.log('[autocomplete] got data', data);
        setSuggestions(data ?? []);
      } catch (error) {
        console.error('[autocomplete] fetch error', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    500
  );

  useEffect(() => {
    if (!inputText.trim()) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchSuggestions();
  }, [inputText, fetchSuggestions]);

  // fetcher for SWR
  const fetcher = (url:string) => fetch(url).then(res => res.json())

  // fix: remove stray '}' from path
  const { data, error, isLoading: swrLoading, mutate } = useSWR<AddressResponse>('/api/address', fetcher);

  if (error) return <div>failed to load</div>;
  // show local loading state (search) separately from SWR loading
  // don't block the entire component while SWR loads saved addresses

  const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
    try {
      await selectSuggestionAction(suggestion, sessionToken);
      // refresh token for next session
      setSessionToken(uuidv4());
      // optionally refetch saved addresses via SWR mutate if needed
      setInputText("");
      mutate()
      router.refresh();
    } catch (err) {
      console.error('[selectSuggestion] error', err);
      alert("error");
    }
  }

  const handleSelectAddress = async (address: Address) => {
    try {
      await selectAddressAction(address.id);
      mutate();
      setOpen(false);
      router.refresh();
    } catch (error) {
      alert("unexpected")
    }
  }

  const handleDeleteAddress = async (addressId: number) => {
    const ok = window.confirm("この住所を削除しますか？")
    if (!ok) return;
    try {
      await deleteAddressAction(addressId);
      setOpen(false);
      mutate()
      router.refresh();
    } catch(error) {
      alert("unexpected")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
      <DialogTrigger>
        {data?.selectedAddress ? data.selectedAddress.name : "住所を選択"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>住所</DialogTitle>
          <DialogDescription className="sr-only">
            住所登録と選択
          </DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false}>
          <div className="bg-muted mb-4">
            <CommandInput
              value={inputText}
              onValueChange={setInputText}
              placeholder="住所を入力..."
            />
          </div>

          <CommandList>
            {mounted && inputText ? (
              <>
                {isLoading && <div className="p-3"><LoaderCircle className="animate-spin inline-block mr-2" />検索中…</div>}

                {!isLoading && suggestions.length === 0 && <CommandEmpty>住所が見つかりません。</CommandEmpty>}

                {!isLoading && suggestions.map(suggestion => (
                  <CommandItem
                    key={suggestion.placeId}
                    onSelect={() => handleSelectSuggestion(suggestion)}
                    className="p-5"
                  >
                    <MapPin />
                    <div className="ml-3">
                      <p className="font-bold">{suggestion.placeName}</p>
                      <p className="text-muted-foreground">{suggestion.address_text}</p>
                    </div>
                  </CommandItem>
                ))}
              </>
            ) : (
              // saved addresses (SWR)
              <>
                <h3 className="font-black text-lg mb-2">保存済みの住所</h3>
                {swrLoading && <div>読み込み中...</div>}
                {!swrLoading && data?.addressList?.length === 0 && <div className="p-3">保存されていません</div>}
                {!swrLoading && data?.addressList?.map(address => (
                  <CommandItem 
                  onSelect={() => handleSelectAddress(address)}
                  key={address.id} 
                  className={cn(
                    "p-5 justify-between items-center",
                    address.id === data?.selectedAddress?.id && "bf-muted"
                  )}

                  >
                    <div>
                      <p className="font-bold">{address.name}</p>
                      <p>{address.address_text}</p>
                    </div>
                    <Button onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAddress(address.id)
                    }} size={"icon"} variant={"ghost"}>
                      <Trash2></Trash2>
                    </Button>
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

