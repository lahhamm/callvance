import { useListContacts, useCreateContact, useInitiateCall, getListContactsQueryKey, getListCallsQueryKey, getGetCallStatsQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Phone, Plus, Loader2, PhoneCall, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().optional(),
});

export default function Contacts() {
  const { data: contacts, isLoading } = useListContacts();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isBulkCalling, setIsBulkCalling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createContact = useCreateContact();
  const initiateCall = useInitiateCall();

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", phone: "", email: "", company: "" },
  });

  const filteredContacts = contacts?.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  const allFilteredIds = filteredContacts.map(c => c.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someSelected = allFilteredIds.some(id => selected.has(id));

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const onSubmit = (values: z.infer<typeof contactSchema>) => {
    createContact.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
        toast({ title: "Contact added", description: "Successfully added to database." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add contact.", variant: "destructive" });
      }
    });
  };

  const handleCall = (contactId: number, name: string) => {
    initiateCall.mutate({ data: { contactId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListCallsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCallStatsQueryKey() });
        toast({ title: "Call initiated", description: `Dialing ${name}...` });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to initiate call.", variant: "destructive" });
      }
    });
  };

  const handleBulkCall = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    setIsBulkCalling(true);
    setBulkProgress({ done: 0, total: ids.length });
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const contact = contacts?.find(c => c.id === id);
      try {
        await fetch("/api/calls/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: id }),
        });
        succeeded++;
      } catch {
        failed++;
      }
      setBulkProgress({ done: i + 1, total: ids.length });
      // Small delay between calls to avoid rate limits
      if (i < ids.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setIsBulkCalling(false);
    setBulkProgress(null);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCallsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCallStatsQueryKey() });
    toast({
      title: "Bulk call complete",
      description: `${succeeded} call${succeeded !== 1 ? "s" : ""} initiated${failed > 0 ? `, ${failed} failed` : ""}.`,
    });
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Directory</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage contacts and initiate outbound sequences.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              onClick={handleBulkCall}
              disabled={isBulkCalling}
              className="border-primary text-primary hover:bg-primary/10 uppercase text-xs tracking-wider font-bold"
              data-testid="button-bulk-call"
            >
              {isBulkCalling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "Calling..."}
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4 mr-2" />
                  Call Selected ({selected.size})
                </>
              )}
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider" data-testid="button-add-contact">
                <Plus className="w-4 h-4 mr-2" />
                New Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight text-primary">Add New Entry</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase text-xs text-muted-foreground">Name</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background border-border focus-visible:ring-primary rounded-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase text-xs text-muted-foreground">Phone Number</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background border-border focus-visible:ring-primary rounded-none" placeholder="+1234567890" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase text-xs text-muted-foreground">Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" className="bg-background border-border focus-visible:ring-primary rounded-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="company" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase text-xs text-muted-foreground">Organization</FormLabel>
                        <FormControl>
                          <Input {...field} className="bg-background border-border focus-visible:ring-primary rounded-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <Button type="submit" className="w-full uppercase font-bold tracking-widest mt-4" disabled={createContact.isPending} data-testid="button-submit-contact">
                    {createContact.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card border border-border p-2">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <Input
          placeholder="QUERY DIRECTORY..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 bg-transparent focus-visible:ring-0 rounded-none placeholder:text-muted-foreground"
          data-testid="input-search-contacts"
        />
      </div>

      {selected.size > 0 && (
        <div className="text-xs text-muted-foreground border border-primary/20 bg-primary/5 px-4 py-2 uppercase tracking-wider">
          {selected.size} target{selected.size !== 1 ? "s" : ""} selected — use "Call Selected" to queue outbound calls
        </div>
      )}

      <div className="border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-background/50 border-b border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  data-testid="checkbox-select-all"
                  className="border-muted-foreground"
                />
              </TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider">Target</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider hidden md:table-cell">Organization</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider">Status</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider hidden lg:table-cell">Last Active</TableHead>
              <TableHead className="text-right uppercase text-xs font-bold tracking-wider">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground uppercase text-sm">
                  Loading Database...
                </TableCell>
              </TableRow>
            ) : filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground uppercase text-sm">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className={`border-border hover:bg-secondary/20 transition-colors group ${selected.has(contact.id) ? "bg-primary/5" : ""}`}
                  data-testid={`row-contact-${contact.id}`}
                >
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selected.has(contact.id)}
                      onCheckedChange={() => toggleSelect(contact.id)}
                      data-testid={`checkbox-contact-${contact.id}`}
                      className="border-muted-foreground"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-sm text-foreground">{contact.name}</div>
                    <div className="text-xs text-muted-foreground">{contact.phone}</div>
                    {contact.email && <div className="text-xs text-muted-foreground/70 hidden sm:block">{contact.email}</div>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {contact.company || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-[10px] border-primary/30 text-primary bg-primary/5">
                      {contact.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {contact.lastCalledAt ? new Date(contact.lastCalledAt).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => handleCall(contact.id, contact.name)}
                      disabled={initiateCall.isPending || isBulkCalling}
                      className="opacity-0 group-hover:opacity-100 transition-opacity uppercase text-xs tracking-wider"
                      data-testid={`button-call-${contact.id}`}
                    >
                      <Phone className="w-3 h-3 mr-2" />
                      Engage
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
