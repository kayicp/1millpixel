import RBTree "../util/motoko/StableCollections/RedBlackTree/RBTree";
import T "type";
import L "lib";
import Result "../util/motoko/Result";
import Value "../util/motoko/Value";
import LEB128 "mo:leb128";
import MerkleTree "../util/motoko/MerkleTree";
import CertifiedData "mo:base/CertifiedData";
import ArchiveT "../util/motoko/Archive/Types";
import ArchiveL "../util/motoko/Archive";
import Archive "../util/motoko/Archive/Canister";
import Principal "mo:base/Principal";
import Blob "mo:base/Blob";
import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Buffer "mo:base/Buffer";
import Nat64 "mo:base/Nat64";
import Error "../util/motoko/Error";
import ICRC3T "../util/motoko/ICRC-3/Types";
import Subaccount "../util/motoko/Subaccount";
import Cycles "mo:core/Cycles";
import Time64 "../util/motoko/Time64";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import VarArray "mo:core/VarArray";
import Array "mo:core/Array";
import ICRC1L "../icrc1_canister/ICRC1";
import ICRC1T "../icrc1_canister/Types";
import ICRC1 "../icrc1_canister/main";
import Linker1 "linker1";

shared (install) persistent actor class Canister(
  deploy : {
    #Init : T.Environment;
    #Upgrade;
  }
) = Self {
  var tip_cert = MerkleTree.empty();
  func updateTipCert() = CertifiedData.set(MerkleTree.treeHash(tip_cert));
  system func postupgrade() = updateTipCert(); // https://gist.github.com/nomeata/f325fcd2a6692df06e38adedf9ca1877

  var env : T.Environment = {
    available = true;
    memo_size = { min = 1; max = 32 };
    canvas = { h = 1000; w = 1000 };
    duration = {
      tx_window = Time64.HOURS(24);
      permitted_drift = Time64.SECONDS(60);
    };
    fee_collector = install.caller;
    linker = "";
    plans = [
      {
        credits = 100; // doodler
        multiplier = 3; // 0.03 ICP
      },
      {
        credits = 1_000; // artist
        multiplier = 2; // 0.2 ICP
      },
      {
        credits = 5_000; // dominator
        multiplier = 1; // 0.5 ICP
      },
    ];
    max_update_batch_size = 1;
    max_query_batch_size = 1;
    max_take_value = 1;
    archive = {
      max_update_batch_size = 10;
      root = null;
      standby = null;
      min_tcycles = 4;
    };
  };
  switch deploy {
    case (#Init i) updateTipCert(env := i);
    case _ ();
  };

  public shared query func icrc3_get_blocks(args : [ICRC3T.GetBlocksArg]) : async ICRC3T.GetBlocksResult {
    {
      log_length = 0;
      blocks = [];
      archived_blocks = [];
    };
  };
  public shared query func canvas_pixels_of(coords : [{ x : Nat; y : Nat }]) : async [Nat8] {
    [];
  };
  public shared query func canvas_credits_of(args : [ICRC1T.Account]) : async [Nat] {
    let max_take = Nat.min(args.size(), env.max_query_batch_size);
    let buff = Buffer.Buffer<Nat>(max_take);
    label finding for (arg in args.vals()) {
      let user = getUser(arg.owner);
      let sub = Subaccount.get(arg.subaccount);
      let credit = L.getCredit(user, sub);
      buff.add(credit);
      if (buff.size() >= max_take) break finding;
    };
    Buffer.toArray(buff);
  };
  public shared query func canvas_linker() : async Principal = async Principal.fromText(env.linker);
  public shared query func canvas_width() : async Nat = async env.canvas.w;
  public shared query func canvas_height() : async Nat = async env.canvas.h;
  public shared query func canvas_credit_plans() : async [T.Plan] = async env.plans;

  var users = RBTree.empty<Principal, T.User>();
  // var expiries = RBTree.empty<Nat64, T.EUser>();
  let canvas : T.Ys = Array.tabulate<T.Xs>(env.canvas.h, func(_) : T.Xs = VarArray.tabulate<Nat8>(env.canvas.w, func(_) : Nat8 = 0));

  var commit_dedupes = RBTree.empty<(Principal, T.CommitArg), Nat>();
  var topup_dedupes = RBTree.empty<(Principal, T.TopupArg), Nat>();

  var blocks = RBTree.empty<Nat, ArchiveT.Block>();

  func getUser(p : Principal) : T.User = switch (RBTree.get(users, Principal.compare, p)) {
    case (?found) found;
    case _ RBTree.empty();
  };
  func saveUser<Return>(p : Principal, u : T.User, r : Return) : Return {
    users := if (RBTree.size(u) > 0) RBTree.insert(users, Principal.compare, p, u) else RBTree.delete(users, Principal.compare, p);
    r;
  };
  func newBlock(block_id : Nat, val : Value.Type) {
    let valh = Value.hash(val);
    let idh = Blob.fromArray(LEB128.toUnsignedBytes(block_id));
    blocks := RBTree.insert(blocks, Nat.compare, block_id, { val; valh; idh; locked = false });

    tip_cert := MerkleTree.empty();
    tip_cert := MerkleTree.put(tip_cert, [Text.encodeUtf8(ICRC3T.LAST_BLOCK_INDEX)], idh);
    tip_cert := MerkleTree.put(tip_cert, [Text.encodeUtf8(ICRC3T.LAST_BLOCK_HASH)], valh);
    updateTipCert();
  };

  func sendBlock() : async* Result.Type<(), { #Sync : Error.Generic; #Async : Error.Generic }> {
    if (RBTree.size(blocks) <= env.archive.max_update_batch_size) return #Err(#Sync(Error.generic("Not enough blocks to archive", 0)));
    var locks = RBTree.empty<Nat, ArchiveT.Block>();
    let batch_buff = Buffer.Buffer<ICRC3T.BlockResult>(env.archive.max_update_batch_size);
    label collecting for ((b_id, b) in RBTree.entries(blocks)) {
      if (b.locked) return #Err(#Sync(Error.generic("Some blocks are locked for archiving", 0)));
      locks := RBTree.insert(locks, Nat.compare, b_id, b);
      batch_buff.add({ id = b_id; block = b.val });
      if (batch_buff.size() >= env.archive.max_update_batch_size) break collecting;
    };
    for ((b_id, b) in RBTree.entries(locks)) blocks := RBTree.insert(blocks, Nat.compare, b_id, { b with locked = true });
    func reunlock<T>(t : T) : T {
      for ((b_id, b) in RBTree.entries(locks)) blocks := RBTree.insert(blocks, Nat.compare, b_id, { b with locked = false });
      t;
    };
    let root = switch (env.archive.root) {
      case (?exist) exist;
      case _ switch (await* createArchive(null)) {
        case (#Ok created) created;
        case (#Err err) return reunlock(#Err(#Async(err)));
      };
    };
    let batch = Buffer.toArray(batch_buff);
    let start = batch[0].id;
    var prev_redir : ArchiveT.Redirect = #Ask(actor (Principal.toText(root)));
    var curr_redir = prev_redir;
    var next_redir = try await (actor (Principal.toText(root)) : Archive.Canister).rb_archive_ask(start) catch ee return reunlock(#Err(#Async(Error.convert(ee))));

    label travelling while true {
      switch (ArchiveL.validateSequence(prev_redir, curr_redir, next_redir)) {
        case (#Err msg) return reunlock(#Err(#Async(Error.generic(msg, 0))));
        case _ ();
      };
      prev_redir := curr_redir;
      curr_redir := next_redir;
      next_redir := switch next_redir {
        case (#Ask cnstr) try await cnstr.rb_archive_ask(start) catch ee return reunlock(#Err(#Async(Error.convert(ee))));
        case (#Add cnstr) {
          let cnstr_id = Principal.fromActor(cnstr);
          try {
            switch (await cnstr.rb_archive_add(batch)) {
              case (#Err(#InvalidDestination r)) r;
              case (#Err(#UnexpectedBlock x)) return reunlock(#Err(#Async(Error.generic("UnexpectedBlock: " # debug_show x, 0))));
              case (#Err(#MinimumBlockViolation x)) return reunlock(#Err(#Async(Error.generic("MinimumBlockViolation: " # debug_show x, 0))));
              case (#Err(#BatchTooLarge x)) return reunlock(#Err(#Async(Error.generic("BatchTooLarge: " # debug_show x, 0))));
              case (#Err(#GenericError x)) return reunlock(#Err(#Async(#GenericError x)));
              case (#Ok) break travelling;
            };
          } catch ee #Create(actor (Principal.toText(cnstr_id)));
        };
        case (#Create cnstr) {
          let cnstr_id = Principal.fromActor(cnstr);
          try {
            let slave = switch (await* createArchive(?cnstr_id)) {
              case (#Err err) return reunlock(#Err(#Async(err)));
              case (#Ok created) created;
            };
            switch (await cnstr.rb_archive_create(slave)) {
              case (#Err(#InvalidDestination r)) r;
              case (#Err(#GenericError x)) return reunlock(#Err(#Async(#GenericError x)));
              case (#Ok new_root) {
                let new_archive = {
                  env.archive with root = ?new_root;
                  standby = null;
                };
                env := { env with archive = new_archive };
                #Add(actor (Principal.toText(slave)));
              };
            };
          } catch ee return reunlock(#Err(#Async(Error.convert(ee))));
        };
      };
    };
    for (b in batch.vals()) blocks := RBTree.delete(blocks, Nat.compare, b.id);
    #Ok;
  };
  func createArchive(master : ?Principal) : async* Result.Type<Principal, Error.Generic> {
    let trillion = 10 ** 12;
    let cost = env.archive.min_tcycles * trillion;
    if (Cycles.balance() < cost * 2) return Error.text("Insufficient cycles balance to create a new archive"); // * 2 for self and archive
    switch (env.archive.standby) {
      case (?standby) return try switch (await (actor (Principal.toText(standby)) : Archive.Canister).rb_archive_initialize(master)) {
        case (#Err err) #Err err;
        case _ #Ok standby;
      } catch e #Err(Error.convert(e));
      case _ ();
    };
    try {
      let new_canister = await (with cycles = cost) Archive.Canister(master);
      #Ok(Principal.fromActor(new_canister));
    } catch e #Err(Error.convert(e));
  };

  func checkMemo(m : ?Blob) : Result.Type<(), Error.Generic> = switch m {
    case (?defined) {
      if (defined.size() < env.memo_size.min) return Error.text("Memo size must be larger than " # debug_show env.memo_size.min);
      if (defined.size() > env.memo_size.max) return Error.text("Memo size must be smaller than " # debug_show env.memo_size.max);
      #Ok;
    };
    case _ #Ok;
  };
  func checkIdempotency(caller : Principal, opr : T.ArgType, created_at : ?Nat64, now : Nat64) : Result.Type<(), { #CreatedInFuture : { time : Nat64 }; #TooOld; #Duplicate : { of : Nat } }> {
    let ct = switch created_at {
      case (?defined) defined;
      case _ return #Ok;
    };
    let start_time = now - env.duration.tx_window - env.duration.permitted_drift;
    if (ct < start_time) return #Err(#TooOld);
    let end_time = now + env.duration.permitted_drift;
    if (ct > end_time) return #Err(#CreatedInFuture { time = now });
    let find_dupe = switch opr {
      case (#Commit arg) RBTree.get(commit_dedupes, L.dedupeCommit, (caller, arg));
      case (#Topup arg) RBTree.get(topup_dedupes, L.dedupeTopup, (caller, arg));
    };
    switch find_dupe {
      case (?of) #Err(#Duplicate { of });
      case _ #Ok;
    };
  };

  func commitPixel(caller : Principal, arg : T.CommitArg, caller_validated : Bool, now : Nat64) : Result.Type<Nat, T.CommitErr> {
    if (not env.available) return Error.text("Unavailable");
    if (not caller_validated) return (Error.text("Caller must not be Anonymous or Management"));

    if (not Subaccount.validate(arg.subaccount)) return (Error.text("Subaccount is invalid"));

    if (arg.y + 1 > env.canvas.h) return #Err(#YTooLarge { maximum_y = env.canvas.h - 1 });
    if (arg.x + 1 > env.canvas.w) return #Err(#XTooLarge { maximum_x = env.canvas.w - 1 });
    switch (checkMemo(arg.memo)) {
      case (#Err err) return #Err err;
      case _ ();
    };
    var user = getUser(caller);
    let sub = Subaccount.get(arg.subaccount);
    var credit = L.getCredit(user, sub);
    if (credit == 0) return #Err(#NoCredits);

    switch (checkIdempotency(caller, #Commit arg, arg.created_at, now)) {
      case (#Err err) return #Err err;
      case _ ();
    };
    credit := L.useCredit(credit);
    user := L.saveCredit(user, sub, credit);
    saveUser(caller, user, ());

    canvas[arg.y][arg.x] := arg.color;

    let (block_id, phash) = ArchiveL.getPhash(blocks);
    if (arg.created_at != null) commit_dedupes := RBTree.insert(commit_dedupes, L.dedupeCommit, (caller, arg), block_id);
    newBlock(block_id, L.valueCommit(caller, sub, arg, now, phash));

    #Ok block_id;
  };
  public shared ({ caller }) func canvas_commit(args : [T.CommitArg]) : async [Result.Type<Nat, T.CommitErr>] {
    // todo: syncTrim()
    let res_size = Nat.min(args.size(), env.max_update_batch_size);
    let res = Buffer.Buffer<Result.Type<Nat, T.CommitErr>>(res_size);
    let now = Time64.nanos();
    label processing for (i in Iter.range(0, res_size - 1)) {
      res.add(commitPixel(caller, args[i], ICRC1L.validatePrincipal(caller), now));
    };
    ignore await* sendBlock();
    Buffer.toArray(res);
  };

  public shared ({ caller }) func canvas_topup(arg : T.TopupArg) : async Result.Type<Nat, T.TopupErr> {
    // todo: syncTrim()
    if (not env.available) return Error.text("Unavailable");
    let user_a = { owner = caller; subaccount = arg.subaccount };
    if (not ICRC1L.validateAccount(user_a)) return Error.text("Caller account is not valid");

    switch (checkMemo(arg.memo)) {
      case (#Err err) return #Err err;
      case _ ();
    };
    if (arg.plan + 1 > env.plans.size()) return Error.text("Unrecognized plan");
    let linker_canister = actor (env.linker) : Linker1.Canister;
    let icrc1_token_p = await linker_canister.linker1_token();
    let icrc1_canister = actor (Principal.toText(icrc1_token_p)) : ICRC1.Canister;
    let icrc1_fee = await icrc1_canister.icrc1_fee();
    let withdraw_fee = icrc1_fee * 2;
    let topup_credits = env.plans[arg.plan].credits;
    let topup_fee = icrc1_fee * topup_credits * env.plans[arg.plan].multiplier;
    switch (arg.fee) {
      case (?defined) if (defined != topup_fee) return #Err(#BadFee { expected_fee = topup_fee });
      case _ ();
    };
    switch (arg.amount) {
      case (?defined) if (defined != topup_credits) return #Err(#BadAmount { expected_amount = topup_credits });
      case _ ();
    };
    let now = Time64.nanos();
    switch (checkIdempotency(caller, #Topup arg, arg.created_at, now)) {
      case (#Err err) return #Err err;
      case _ ();
    };
    let pay_arg = {
      proxy = user_a;
      amount = topup_fee;
      to = { owner = env.fee_collector; subaccount = null };
      fee = ?withdraw_fee;
      spender_subaccount = null;
      memo = null;
      created_at = null;
    };
    let pay_id = switch (await linker_canister.linker1_withdraw_from(pay_arg)) {
      case (#Ok ok) ok;
      case (#Err err) return #Err(#TopupFailed err);
    };
    var user = getUser(caller);
    let sub = Subaccount.get(arg.subaccount);
    var credit = L.getCredit(user, sub);
    credit += topup_credits;
    user := L.saveCredit(user, sub, credit);
    saveUser(caller, user, ());

    let (block_id, phash) = ArchiveL.getPhash(blocks);
    if (arg.created_at != null) topup_dedupes := RBTree.insert(topup_dedupes, L.dedupeTopup, (caller, arg), block_id);
    newBlock(block_id, L.valueTopup(caller, sub, topup_fee, topup_credits, arg, pay_id, now, phash));

    ignore await* sendBlock();
    #Ok block_id;
  };
};
