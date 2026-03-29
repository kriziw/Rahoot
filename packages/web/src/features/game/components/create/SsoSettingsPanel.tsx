import type {
  OidcConfig,
  OidcConfigInput,
  OidcConfigTestResult,
} from "@mindbuzz/common/types/game"
import Button from "@mindbuzz/web/features/game/components/Button"
import Input from "@mindbuzz/web/features/game/components/Input"
import { useEffect, useState } from "react"

type Props = {
  config: OidcConfig
  onSave: (_config: OidcConfigInput) => void
  onTest: (_config: OidcConfigInput) => void
  isTesting: boolean
  testResult: OidcConfigTestResult | null
}

const listToText = (values: string[]) => values.join(", ")

const parseList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

const SsoSettingsPanel = ({
  config,
  onSave,
  onTest,
  isTesting,
  testResult,
}: Props) => {
  const [enabled, setEnabled] = useState(config.enabled)
  const [autoProvisionEnabled, setAutoProvisionEnabled] = useState(
    config.autoProvisionEnabled,
  )
  const [discoveryUrl, setDiscoveryUrl] = useState(config.discoveryUrl)
  const [clientId, setClientId] = useState(config.clientId)
  const [clientSecret, setClientSecret] = useState("")
  const [clearClientSecret, setClearClientSecret] = useState(false)
  const [scopes, setScopes] = useState(listToText(config.scopes))
  const [roleClaimPath, setRoleClaimPath] = useState(config.roleClaimPath)
  const [adminRoleValues, setAdminRoleValues] = useState(
    listToText(config.adminRoleValues),
  )
  const [managerRoleValues, setManagerRoleValues] = useState(
    listToText(config.managerRoleValues),
  )

  useEffect(() => {
    setEnabled(config.enabled)
    setAutoProvisionEnabled(config.autoProvisionEnabled)
    setDiscoveryUrl(config.discoveryUrl)
    setClientId(config.clientId)
    setClientSecret("")
    setClearClientSecret(false)
    setScopes(listToText(config.scopes))
    setRoleClaimPath(config.roleClaimPath)
    setAdminRoleValues(listToText(config.adminRoleValues))
    setManagerRoleValues(listToText(config.managerRoleValues))
  }, [config])

  const buildConfigInput = (): OidcConfigInput => ({
      enabled,
      autoProvisionEnabled,
      discoveryUrl: discoveryUrl.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim() || undefined,
      clearClientSecret,
      scopes: parseList(scopes),
      roleClaimPath: roleClaimPath.trim(),
      adminRoleValues: parseList(adminRoleValues),
      managerRoleValues: parseList(managerRoleValues),
    })

  const handleSave = () => {
    onSave(buildConfigInput())
  }

  const handleTest = () => {
    onTest(buildConfigInput())
  }

  return (
    <div className="z-10 flex w-full max-w-4xl flex-col gap-5 rounded-md bg-white p-4 shadow-sm md:p-6">
      <div>
        <h1 className="text-2xl font-bold">SSO settings</h1>
        <p className="text-sm text-gray-500">
          Configure a generic OpenID Connect provider here. Changes are saved to
          the file-backed auth config so you still have a manual recovery path.
        </p>
      </div>

      <section className="rounded-md bg-gray-50 p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-md bg-white p-3">
            <input
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              type="checkbox"
            />
            <div>
              <p className="font-semibold">Enable SSO</p>
              <p className="text-sm text-gray-500">
                Show the SSO login option on the manager page.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-md bg-white p-3">
            <input
              checked={autoProvisionEnabled}
              onChange={(event) => setAutoProvisionEnabled(event.target.checked)}
              type="checkbox"
            />
            <div>
              <p className="font-semibold">Allow automatic provisioning</p>
              <p className="text-sm text-gray-500">
                Create and role-map manager accounts from the identity provider.
              </p>
            </div>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Discovery URL
            </label>
            <Input
              className="w-full"
              onChange={(event) => setDiscoveryUrl(event.target.value)}
              placeholder="https://id.example.com/application/o/mindbuzz/.well-known/openid-configuration"
              value={discoveryUrl}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Client ID
            </label>
            <Input
              className="w-full"
              onChange={(event) => setClientId(event.target.value)}
              placeholder="mindbuzz"
              value={clientId}
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">
              Client secret
            </label>
            <Input
              className="w-full"
              onChange={(event) => {
                setClientSecret(event.target.value)
                if (event.target.value) {
                  setClearClientSecret(false)
                }
              }}
              placeholder={
                config.hasClientSecret
                  ? "Stored securely. Enter a new secret to replace it."
                  : "Paste the client secret"
              }
              type="password"
              value={clientSecret}
            />
            <div className="flex flex-col gap-2 text-sm text-gray-500 md:flex-row md:items-center md:justify-between">
              <span>
                {config.hasClientSecret && !clearClientSecret
                  ? "A client secret is already stored."
                  : clearClientSecret
                    ? "The stored client secret will be removed when you save."
                    : "No client secret is currently stored."}
              </span>
              {config.hasClientSecret && (
                <Button
                  className="bg-white px-4 !text-black"
                  onClick={() => {
                    setClientSecret("")
                    setClearClientSecret((current) => !current)
                  }}
                  type="button"
                >
                  {clearClientSecret ? "Keep stored secret" : "Clear stored secret"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Scopes</label>
            <Input
              className="w-full"
              onChange={(event) => setScopes(event.target.value)}
              placeholder="openid, profile, email"
              value={scopes}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Role claim path
            </label>
            <Input
              className="w-full"
              onChange={(event) => setRoleClaimPath(event.target.value)}
              placeholder="groups"
              value={roleClaimPath}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Admin role values
            </label>
            <Input
              className="w-full"
              onChange={(event) => setAdminRoleValues(event.target.value)}
              placeholder="mindbuzz-admin"
              value={adminRoleValues}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Manager role values
            </label>
            <Input
              className="w-full"
              onChange={(event) => setManagerRoleValues(event.target.value)}
              placeholder="mindbuzz-manager"
              value={managerRoleValues}
            />
          </div>
        </div>

        <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          Redirect URI:
          <span className="ml-2 font-mono text-xs">
            https://your-domain.example/auth/oidc/callback
          </span>
        </div>

        {testResult && (
          <div className="mt-4 rounded-md border border-green-100 bg-green-50 p-3 text-sm text-green-900">
            <p className="font-semibold">SSO discovery test succeeded</p>
            <p className="mt-1 break-all">
              Issuer:
              <span className="ml-2 font-mono text-xs">{testResult.issuer}</span>
            </p>
            <p className="mt-1 break-all">
              Authorization endpoint:
              <span className="ml-2 font-mono text-xs">
                {testResult.authorizationEndpoint}
              </span>
            </p>
            <p className="mt-1 break-all">
              Token endpoint:
              <span className="ml-2 font-mono text-xs">
                {testResult.tokenEndpoint}
              </span>
            </p>
            {testResult.userinfoEndpoint && (
              <p className="mt-1 break-all">
                Userinfo endpoint:
                <span className="ml-2 font-mono text-xs">
                  {testResult.userinfoEndpoint}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="bg-white px-4 !text-black"
            onClick={handleTest}
            type="button"
          >
            {isTesting ? "Testing SSO..." : "Test SSO settings"}
          </Button>
          <Button className="px-4" onClick={handleSave} type="button">
            Save SSO settings
          </Button>
        </div>
      </section>
    </div>
  )
}

export default SsoSettingsPanel
