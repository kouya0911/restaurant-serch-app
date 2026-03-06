"use client"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
  CommandItem
} from "@/components/ui/command"
import { RestaurantSuggestion } from "@/types";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { useState, useEffect, useRef } from "react";
import { useDebouncedCallback } from 'use-debounce';
import { v4 as uuidv4 } from 'uuid';

interface PlaceSearchBarProps {
    lat: number,
    Ing: number
}

export default function PlaceSearchBar({lat, Ing}:PlaceSearchBarProps) {
    const [open, setOpen] = useState(false);
    const [inputText, setInputText] = useState("");
    const [sessionToken, setSessionToken] = useState(uuidv4());
    const [suggestions, setSuggestions] = useState<RestaurantSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false)

    const clickedOnItem = useRef(false);
    const router = useRouter();

const fetchSuggestions = useDebouncedCallback(
    async () => {
    if(!inputText.trim()) {
        setSuggestions([])
        return;
    }
    try {
        const response = await fetch(`/api/restaurant/autocomplete?input=${inputText}&sessionToken=${sessionToken}&lat=${lat}&Ing=${Ing}`);
        const data:RestaurantSuggestion[] = await response.json()
        setSuggestions(data)
    } catch (error) {
        console.error(error);
    } finally {
        setIsLoading(false);
    }
}, 500);

    useEffect(()=> {
        if(!inputText.trim()) {""
            setOpen(false);
            setSuggestions([])
            return;
        }
        setIsLoading(true);
        setOpen(true)
        fetchSuggestions();
    }, [inputText]);

    const handleBlur = () => {
        if(clickedOnItem.current) {
            clickedOnItem.current = false;
            return;
        }
        setOpen(false)
    }

    const handleFocus = () => {
        if(inputText){
            setOpen(true)
        }
    }

    const handleSelectSuggestion = (suggestion:RestaurantSuggestion) => {
        if(suggestion.type === "placePrediction") {
            router.push(
                `/restaurant/${suggestion.placeId}?sesstionToken=${sessionToken}`
            );
        } else {
            router.push(
                `/search?restaurant=${suggestion.placeName}`
            );
            setSessionToken(uuidv4());
        }
        setOpen(false);
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!inputText.trim()) return;
        if (e.key === "Enter") {
            router.push(
                `/search?restaurant=${inputText}`
            );
            setOpen(false);
        }
    }

  return (
    <Command onKeyDown={handleKeyDown} className="overflow-visible bg-muted" shouldFilter={false}>
        <CommandInput 
        value={inputText}
        placeholder="Type a command or search..."
        onValueChange={(text) => {
            if(!open) {
                setOpen(true);
            }
            setInputText(text)
            
        }}
        onBlur={handleBlur}
        onFocus={handleFocus}
        />
        {open && (
            <div className="relative">
            <CommandList className="absolute bg-background w-full shadow-md rounded-lg">
                <div className="flex items-center justify-center">
                    <CommandEmpty>
                        {isLoading ? <LoaderCircle className="animate-spin" /> : "レストランが見つかりません。"}
                    </CommandEmpty>
                </div>
                {suggestions.map((suggestion, index) => (
                    <CommandItem 
                    key={suggestion.placeId ?? index} 
                    value={suggestion.placeName}
                    className="p-5"
                    onSelect={() => handleSelectSuggestion(suggestion)}
                    onMouseDown={() => clickedOnItem.current = true}
                    >
                        {suggestion.type === "queryPrediction" ? <Search /> : <MapPin />}
                        <p>{suggestion.placeName}</p>
                    </CommandItem>
                ))}
            </CommandList>
        </div>
        )}
    </Command>
  )
}
