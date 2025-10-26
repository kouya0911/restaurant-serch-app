"use client"
import { Button } from "@/components/ui/button";
import React, { useState } from "react";

export default function TextToggleButton() {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const handleChange = () => {
        setIsExpanded(prev => !prev)
    }

    return (
        <Button onClick={handleChange}>{isExpanded ? "表示を戻す" : "すべて表示"}</Button>
    )
}
