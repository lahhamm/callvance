import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, User, Phone, XCircle, RefreshCw, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Booking = {
  id: number;
  contactId?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  callId?: number | null;
  scheduledAt: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  timezone?: string | null;
};

function formatDateTime(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const datePart = new Date(iso).toLocaleDateString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const timePart = new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit",
  });
  const tzAbbr = new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() ?? "";
  return `${datePart}, ${timePart} ${tzAbbr}`;
}

function isUpcoming(iso: string) {
  return new Date(iso) > new Date();
}

export default function BookingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [newDateTime, setNewDateTime] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBooking, setNewBooking] = useState({ contactName: "", contactPhone: "", scheduledAt: "", notes: "" });

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings"],
    queryFn: () => customFetch("/api/bookings"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast({ title: "Booking cancelled" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: number; scheduledAt: string }) =>
      customFetch(`/api/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setRescheduleBooking(null);
      setNewDateTime("");
      toast({ title: "Booking rescheduled" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newBooking) =>
      customFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          scheduledAt: new Date(data.scheduledAt).toISOString(),
          notes: data.notes || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setShowAddModal(false);
      setNewBooking({ contactName: "", contactPhone: "", scheduledAt: "", notes: "" });
      toast({ title: "Booking created" });
    },
  });

  const upcoming = bookings.filter(b => b.status === "confirmed" && isUpcoming(b.scheduledAt));
  const past = bookings.filter(b => b.status !== "confirmed" || !isUpcoming(b.scheduledAt));

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-1 text-sm">Upcoming appointments scheduled by your AI agent.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 text-xs uppercase tracking-wider border border-primary/40 px-3 py-2 text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Booking
        </button>
      </div>

      {/* Upcoming */}
      <section>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          Upcoming — {upcoming.length}
        </div>
        {isLoading ? (
          <div className="border border-border p-8 text-center text-muted-foreground text-sm uppercase">Loading...</div>
        ) : upcoming.length === 0 ? (
          <div className="border border-border p-8 text-center text-muted-foreground text-sm uppercase">
            No upcoming appointments
          </div>
        ) : (
          <div className="border border-border bg-card divide-y divide-border">
            {upcoming.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                onCancel={() => cancelMutation.mutate(b.id)}
                onReschedule={() => {
                  setRescheduleBooking(b);
                  setNewDateTime(b.scheduledAt.slice(0, 16));
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Past / Cancelled */}
      {past.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />
            Past & Cancelled — {past.length}
          </div>
          <div className="border border-border bg-card divide-y divide-border opacity-60">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}

      {/* Reschedule modal */}
      <Dialog open={!!rescheduleBooking} onOpenChange={(open) => !open && setRescheduleBooking(null)}>
        <DialogContent className="border-border bg-card font-mono">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-tight text-primary">Reschedule Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {rescheduleBooking?.contactName || rescheduleBooking?.contactPhone}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">New Date & Time</Label>
              <Input
                type="datetime-local"
                value={newDateTime}
                onChange={e => setNewDateTime(e.target.value)}
                className="font-mono bg-background border-border"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRescheduleBooking(null)} className="uppercase text-xs tracking-wider">
              Cancel
            </Button>
            <Button
              onClick={() => rescheduleBooking && rescheduleMutation.mutate({ id: rescheduleBooking.id, scheduledAt: new Date(newDateTime).toISOString() })}
              disabled={!newDateTime || rescheduleMutation.isPending}
              className="uppercase text-xs tracking-wider"
            >
              {rescheduleMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add booking modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="border-border bg-card font-mono">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-tight text-primary">New Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Lead Name</Label>
              <Input value={newBooking.contactName} onChange={e => setNewBooking(p => ({ ...p, contactName: e.target.value }))} className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Phone</Label>
              <Input value={newBooking.contactPhone} onChange={e => setNewBooking(p => ({ ...p, contactPhone: e.target.value }))} className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Date & Time</Label>
              <Input type="datetime-local" value={newBooking.scheduledAt} onChange={e => setNewBooking(p => ({ ...p, scheduledAt: e.target.value }))} className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Notes (optional)</Label>
              <Input value={newBooking.notes} onChange={e => setNewBooking(p => ({ ...p, notes: e.target.value }))} className="font-mono bg-background border-border" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="uppercase text-xs tracking-wider">Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newBooking)}
              disabled={!newBooking.scheduledAt || createMutation.isPending}
              className="uppercase text-xs tracking-wider"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookingRow({
  booking,
  onCancel,
  onReschedule,
}: {
  booking: Booking;
  onCancel?: () => void;
  onReschedule?: () => void;
}) {
  const upcoming = booking.status === "confirmed" && isUpcoming(booking.scheduledAt);
  return (
    <div className="p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-bold text-sm">{booking.contactName || "Unknown"}</span>
          </div>
          {booking.contactPhone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              {booking.contactPhone}
            </div>
          )}
          <Badge
            variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}
            className="uppercase text-[10px]"
          >
            {booking.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <Calendar className="w-3.5 h-3.5" />
          {formatDateTime(booking.scheduledAt, booking.timezone)}
        </div>
        {booking.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed">{booking.notes}</p>
        )}
      </div>
      {upcoming && (
        <div className="flex items-center gap-2 shrink-0">
          {onReschedule && (
            <button
              onClick={onReschedule}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Reschedule
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider border border-destructive/30 px-2 py-1 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
