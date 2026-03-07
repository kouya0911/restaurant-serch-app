import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

interface CarouselContainerProps {
  children: React.ReactNode[];
  slideToShow: number;
}

export default function CarouselContainer({
  children,
  slideToShow
}: CarouselContainerProps) {
  return (
    <Carousel
      opts={{
        align: "start",
      }}
      className="w-full"
    >
      <CarouselContent className="-ml-2 md:-ml-4">
        {children.map((child, index) => (
          <CarouselItem
            key={index}
            className="pl-2 md:pl-4 basis-[80%] sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
          >
            <div className="p-1">
              {child}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="hidden md:block">
        <CarouselPrevious />
        <CarouselNext />
      </div>
    </Carousel>
  )
}
