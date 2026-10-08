package pro.streamcast.controlroom

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import pro.streamcast.core.Api
import pro.streamcast.core.Brand
import pro.streamcast.core.Message
import pro.streamcast.core.Notice
import pro.streamcast.core.Pill
import pro.streamcast.core.PrimaryButton
import pro.streamcast.core.SectionTitle
import pro.streamcast.core.TextInput
import pro.streamcast.core.objects
import pro.streamcast.core.remote

/**
 * The two money desks of the control room: where applicants send the licence fee, and the
 * applications whose payment proof has to be checked. Verifying a proof marks the fee paid,
 * which is what lets the station be opened on the plan the applicant paid for — premium is
 * the licence that switches monetisation on.
 */

private fun JSONObject.text(key: String): String = if (isNull(key)) "" else optString(key)

private fun units(value: Double, crypto: Boolean): String =
    String.format("%.${if (crypto) 6 else 2}f", value).trimEnd('0').trimEnd('.')

private fun money(cents: Int): String = "$" + String.format("%.2f", cents / 100.0)

private data class PaymentAccount(
    val id: Int,
    val label: String,
    val method: String,
    val currency: String,
    val country: String,
    val accountName: String,
    val accountNumber: String,
    val bankName: String,
    val network: String,
    val rate: String,
    val instructions: String,
    val active: Boolean,
    val standardLabel: String,
    val premiumLabel: String
)

private fun accountOf(row: JSONObject) = PaymentAccount(
    id = row.optInt("id"),
    label = row.optString("label"),
    method = row.optString("method", "bank"),
    currency = row.optString("currency"),
    country = row.text("country"),
    accountName = row.text("account_name"),
    accountNumber = row.text("account_number"),
    bankName = row.text("bank_name"),
    network = row.text("network"),
    rate = row.optString("rate_per_usd"),
    instructions = row.text("instructions"),
    active = row.optBoolean("active", true),
    standardLabel = row.optString("standard_label"),
    premiumLabel = row.optString("premium_label")
)

private val METHODS = listOf("bank" to "Bank", "crypto" to "Crypto", "other" to "Other")

@Composable
fun PaymentsScreen() {
    val accounts = remote("admin-payment-accounts") {
        Api.get("/admin/payment-accounts").objects("accounts").map { accountOf(it) }
    }
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf<Int?>(null) }

    var label by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("bank") }
    var rate by remember { mutableStateOf("") }
    var holder by remember { mutableStateOf("") }
    var number by remember { mutableStateOf("") }
    var bank by remember { mutableStateOf("") }
    var network by remember { mutableStateOf("") }
    var instructions by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    fun toggle(account: PaymentAccount) {
        scope.launch {
            try {
                Api.patch("/admin/payment-accounts/${account.id}", JSONObject().put("active", !account.active))
                message = if (account.active) "${account.label} is hidden from applicants." else "${account.label} is available again."
                accounts.reload()
            } catch (failure: Exception) {
                message = failure.message
            }
        }
    }

    fun remove(account: PaymentAccount) {
        scope.launch {
            try {
                Api.delete("/admin/payment-accounts/${account.id}")
                confirmDelete = null
                message = "Payment account removed."
                accounts.reload()
            } catch (failure: Exception) {
                message = failure.message
            }
        }
    }

    val rateValue = rate.trim().toDoubleOrNull()
    val crypto = method == "crypto"
    val preview = if (rateValue != null && rateValue > 0) {
        "Standard ≈ ${units(rateValue * 5, crypto)} ${currency.uppercase()} · premium ≈ ${units(rateValue * 15, crypto)} ${currency.uppercase()}"
    } else {
        ""
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Payment accounts") }
        item {
            Text(
                "Where applicants send the $5 / $15 station licence — in their own currency.",
                color = Brand.muted,
                fontSize = 11.5.sp
            )
            Spacer(Modifier.height(6.dp))
        }
        message?.let { item { Notice(it) } }

        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
            ) {
                Text("Add a receiving account", color = Brand.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Set how many units of the currency one US dollar buys, so the app shows the exact licence " +
                        "fee for that account — never less or more.",
                    color = Brand.muted,
                    fontSize = 11.5.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )

                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    METHODS.forEach { (value, text) -> ActionChip(if (value == method) "$text ✓" else text) { method = value } }
                }

                TextInput(label, { label = it }, "Label, e.g. Naira bank transfer")
                TextInput(currency, { currency = it.uppercase() }, "Currency (NGN, EUR, USD, BTC…)")
                TextInput(rate, { rate = it }, "Units of the currency per US$1", keyboard = KeyboardType.Decimal)
                if (preview.isNotBlank()) {
                    Text(preview, color = Brand.muted, fontSize = 11.sp, modifier = Modifier.padding(bottom = 4.dp))
                }
                TextInput(holder, { holder = it }, "Account holder")
                TextInput(number, { number = it }, "Account number / wallet address")
                TextInput(bank, { bank = it }, "Bank (optional)")
                TextInput(network, { network = it }, "Network (crypto, optional)")
                TextInput(instructions, { instructions = it }, "Instructions for the applicant")

                Spacer(Modifier.height(6.dp))
                PrimaryButton(
                    text = if (busy) "Adding…" else "Add account",
                    enabled = !busy && label.isNotBlank() && currency.isNotBlank() && (rateValue ?: 0.0) > 0
                ) {
                    busy = true
                    scope.launch {
                        try {
                            Api.post(
                                "/admin/payment-accounts",
                                JSONObject()
                                    .put("label", label.trim())
                                    .put("method", method)
                                    .put("currency", currency.trim().uppercase())
                                    .put("rate_per_usd", rateValue ?: 0.0)
                                    .put("account_name", holder)
                                    .put("account_number", number)
                                    .put("bank_name", bank)
                                    .put("network", network)
                                    .put("instructions", instructions)
                            )
                            label = ""
                            currency = ""
                            rate = ""
                            holder = ""
                            number = ""
                            bank = ""
                            network = ""
                            instructions = ""
                            message = "Payment account added — applicants can pay it now."
                            accounts.reload()
                        } catch (failure: Exception) {
                            message = failure.message
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }

        item { SectionTitle("Accounts") }
        val list = accounts.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (accounts.loading) "Loading accounts…" else accounts.error ?: "No receiving accounts yet.") }
        } else {
            items(list, key = { "account-${it.id}" }) { account ->
                Column {
                    RowCard(onClick = {}) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                "${account.currency} · ${account.label}",
                                color = Brand.text,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                listOfNotNull(
                                    when (account.method) {
                                        "crypto" -> "Cryptocurrency"
                                        "other" -> "Other"
                                        else -> "Bank transfer"
                                    },
                                    account.accountName.takeIf { it.isNotBlank() },
                                    account.bankName.takeIf { it.isNotBlank() },
                                    account.accountNumber.takeIf { it.isNotBlank() },
                                    account.network.takeIf { it.isNotBlank() }
                                ).joinToString(" · "),
                                color = Brand.muted,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                            Text(
                                "Standard ${account.standardLabel} · premium ${account.premiumLabel}",
                                color = Brand.muted,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                        Pill(if (account.active) "available" else "hidden", if (account.active) Brand.ok else Brand.live)
                    }
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ActionChip(if (account.active) "Hide" else "Show") { toggle(account) }
                        if (confirmDelete == account.id) {
                            ActionChip("Confirm delete", danger = true) { remove(account) }
                        } else {
                            ActionChip("Delete", danger = true) { confirmDelete = account.id }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

private data class ApplicationRow(
    val id: Int,
    val station: String,
    val applicant: String,
    val email: String,
    val coverage: String,
    val plan: String,
    val feeCents: Int,
    val feeStatus: String,
    val status: String,
    val currency: String,
    val amount: Double,
    val reference: String,
    val proofStatus: String,
    val proofUrl: String,
    val proofNote: String,
    val reviewNote: String
)

private fun applicationOf(row: JSONObject) = ApplicationRow(
    id = row.optInt("id"),
    station = row.optString("station_name"),
    applicant = row.text("user_name"),
    email = row.text("user_email"),
    coverage = row.optString("coverage", "fm"),
    plan = row.optString("plan", "standard"),
    feeCents = row.optInt("fee_cents"),
    feeStatus = row.optString("fee_status", "unpaid"),
    status = row.optString("status", "pending"),
    currency = row.text("currency"),
    amount = row.optDouble("amount_units", 0.0),
    reference = row.text("payment_reference"),
    proofStatus = row.optString("proof_status", "none"),
    proofUrl = row.text("proof_url"),
    proofNote = row.text("proof_note"),
    reviewNote = row.text("proof_review_note")
)

@Composable
fun ApplicationsScreen() {
    val applications = remote("admin-applications") {
        Api.get("/admin/applications").objects("applications").map { applicationOf(it) }
    }
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }

    fun post(path: String, body: JSONObject, done: String) {
        scope.launch {
            try {
                Api.post(path, body)
                message = done
                applications.reload()
            } catch (failure: Exception) {
                message = failure.message
            }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Station applications") }
        item {
            Text(
                "Verify a transfer payment to mark the fee paid, then approve to open the station on the plan " +
                    "paid for. The $15 premium plan is what lets a station sell premium and paid content.",
                color = Brand.muted,
                fontSize = 11.5.sp
            )
            Spacer(Modifier.height(6.dp))
        }
        message?.let { item { Notice(it) } }

        val list = applications.data.orEmpty()
        if (list.isEmpty()) {
            item {
                Message(if (applications.loading) "Loading applications…" else applications.error ?: "No applications yet.")
            }
        } else {
            items(list, key = { "application-${it.id}" }) { application ->
                Column {
                    RowCard(onClick = {}) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                application.station,
                                color = Brand.text,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                listOfNotNull(
                                    application.applicant.takeIf { it.isNotBlank() },
                                    application.email.takeIf { it.isNotBlank() }
                                ).joinToString(" · "),
                                color = Brand.muted,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                            Text(
                                listOf(
                                    if (application.coverage == "fm_tv") "FM + TV" else "FM only",
                                    "${application.plan} plan",
                                    money(application.feeCents),
                                    "fee ${application.feeStatus}"
                                ).joinToString(" · "),
                                color = Brand.muted,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                            if (application.reference.isNotBlank()) {
                                Text(
                                    "${units(application.amount, application.currency.length > 3)} " +
                                        "${application.currency} · ref ${application.reference}" +
                                        if (application.proofStatus == "verified") " · verified" else "",
                                    color = Brand.muted,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(top = 2.dp)
                                )
                            }
                            application.proofNote.takeIf { it.isNotBlank() }?.let {
                                Text(it, color = Brand.muted, fontSize = 11.sp)
                            }
                            application.reviewNote.takeIf { it.isNotBlank() }?.let {
                                Text("review: $it", color = Brand.muted, fontSize = 11.sp)
                            }
                        }
                        Pill(
                            application.status,
                            when (application.status) {
                                "approved" -> Brand.ok
                                "rejected" -> Brand.live
                                else -> Brand.accent
                            }
                        )
                    }

                    Row(
                        Modifier.padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (application.proofStatus == "submitted") {
                            ActionChip("Verify payment") {
                                post(
                                    "/admin/applications/${application.id}/proof",
                                    JSONObject().put("action", "verify"),
                                    "Licence payment verified for ${application.station}."
                                )
                            }
                            ActionChip("Reject payment", danger = true) {
                                post(
                                    "/admin/applications/${application.id}/proof",
                                    JSONObject().put("action", "reject"),
                                    "Payment proof rejected."
                                )
                            }
                        }
                        if (application.status == "pending" && application.feeStatus == "paid") {
                            ActionChip("Approve station") {
                                post(
                                    "/admin/applications/${application.id}/review",
                                    JSONObject().put("action", "approve"),
                                    "${application.station} is open."
                                )
                            }
                        }
                        if (application.status == "pending") {
                            ActionChip("Reject", danger = true) {
                                post(
                                    "/admin/applications/${application.id}/review",
                                    JSONObject().put("action", "reject"),
                                    "Application rejected."
                                )
                            }
                        }
                        if (application.feeStatus != "paid" && application.proofStatus != "submitted") {
                            ActionChip("Mark fee collected") {
                                post(
                                    "/admin/applications/${application.id}/fee",
                                    JSONObject().put("paid", true),
                                    "Fee marked collected."
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}
