create temporary table test_state (conversation_id uuid);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare conversation uuid;
begin
  conversation := public.start_listing_conversation('10000000-0000-0000-0000-000000000001');
  if conversation is null then raise exception 'Conversation was not created'; end if;
  insert into test_state values (conversation);
  if public.start_listing_conversation('10000000-0000-0000-0000-000000000001') <> conversation then
    raise exception 'Starting the same conversation must be idempotent';
  end if;
  perform public.send_conversation_message(conversation,'Olá, o artigo ainda está disponível?');
  if (select count(*) from public.get_conversation_messages(conversation)) <> 1 then
    raise exception 'Buyer cannot read own conversation message';
  end if;
  if (select count(*) from public.list_my_conversations()) <> 1 then
    raise exception 'Buyer cannot list own conversation';
  end if;
  if has_table_privilege('authenticated','public.marketplace_messages','select') then
    raise exception 'Authenticated users must not read messages directly';
  end if;
  begin
    perform public.send_conversation_message(conversation,'Contacte-me no 875492563');
    raise exception 'External phone number should have been rejected';
  exception when others then
    if sqlerrm = 'External phone number should have been rejected' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$
declare conversation uuid;
begin
  select c.conversation_id into conversation from public.list_my_conversations() c;
  if conversation is null then raise exception 'Seller cannot see own conversation'; end if;
  perform public.send_conversation_message(conversation,'Sim, continua disponível.');
  if (select count(*) from public.get_conversation_messages(conversation)) <> 2 then
    raise exception 'Seller cannot read conversation history';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$
declare conversation uuid;
begin
  select test_state.conversation_id into conversation from test_state;
  begin
    perform public.get_conversation_messages(conversation);
    raise exception 'Non-participant unexpectedly accessed conversation';
  exception when others then
    if sqlerrm = 'Non-participant unexpectedly accessed conversation' then raise; end if;
  end;
end;
$$;
